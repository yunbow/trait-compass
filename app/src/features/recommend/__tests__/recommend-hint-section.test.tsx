import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecommendHintSection } from "@/features/recommend/components/RecommendHintSection";
import { setCurrentLocationEnabled } from "@/features/history/services/settings";
import { selectMunicipality } from "@/features/support/__tests__/helpers/selectMunicipality";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function mockGeolocation() {
  let success: PositionCallback | undefined;
  const getCurrentPosition = vi.fn((next: PositionCallback) => {
    success = next;
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return {
    getCurrentPosition,
    resolve: (lat: number, lng: number) =>
      success?.({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition),
  };
}

function openForm() {
  fireEvent.click(screen.getByText("相談先のヒントを見る(任意)"));
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("相談したい内容"), {
    target: { value: "会議の内容を覚えておくのが難しい" },
  });
  fireEvent.click(screen.getByText("社会人"));
  selectMunicipality("世田谷区");
}

describe("RecommendHintSection", () => {
  it("初期状態ではボタンのみで、入力欄は表示されない(fetch は発行されない)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RecommendHintSection initialTags={[]} />);

    expect(screen.queryByLabelText("相談したい内容")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ボタン押下・入力・プレビュー表示だけでは fetch を一切発行しない(FR-041)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ facilities: [], isAiEnabled: true, isFallback: false, fallbackMessage: null, isCrisisResponse: false }),
        { status: 200 },
      ),
    );

    render(<RecommendHintSection initialTags={[]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("プレビューには送信されるもの(相談内容・年齢層・区市町村・相談分野)と送信されないものを明示する", async () => {
    render(<RecommendHintSection initialTags={["こだわり"]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByRole("button", { name: "こだわり", pressed: true })).toBeTruthy();
    expect(screen.getByText("相談したい内容: 「会議の内容を覚えておくのが難しい」")).toBeTruthy();
    expect(screen.getByText("年齢層: 社会人")).toBeTruthy();
    expect(screen.getByText("区市町村: 世田谷区")).toBeTruthy();
    expect(screen.getByText("相談分野: こだわり")).toBeTruthy();
    expect(screen.getByText("アンケートの回答内容そのもの")).toBeTruthy();
  });

  it("年齢は SupportInputForm と同じ5区分ライフステージの選択肢を表示し、旧2択(18歳未満/以上)は表示しない", () => {
    render(<RecommendHintSection initialTags={[]} autoStart />);

    expect(screen.getByRole("button", { name: "未就学児" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "小学生・中学生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "高校生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "大学生・専門学校生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "社会人" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "18歳未満" })).toBeNull();
    expect(screen.queryByRole("button", { name: "18歳以上" })).toBeNull();
  });

  it("「同意して送信」をクリックしてはじめて /api/recommend へ fetch する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          facilities: [
            {
              id: "fac-001",
              name: "世田谷区 発達障がい相談支援センター",
              municipality: "世田谷区",
              categoryType: "相談窓口",
              address: "東京都世田谷区XX",
              phone: "03-1234-5678",
              summary: "説明文",
              url: "https://example.com",
              sourceCredit: "出典: ダミーデータセット(東京都福祉局)、cc-by-4.0",
              sourceUrl: "https://example.com/dataset",
              aiNote: "落ち着いた環境で相談できる点が合いそうです。",
            },
          ],
          isAiEnabled: true,
          isFallback: false,
          fallbackMessage: null,
          isCrisisResponse: false,
        }),
        { status: 200 },
      ),
    );

    render(<RecommendHintSection initialTags={[]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");

    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("同意して送信"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/recommend",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "会議の内容を覚えておくのが難しい",
          age: "adult",
          lifestage: "working-adult",
          municipality: "世田谷区",
          tags: [],
        }),
      }),
    );

    expect(await screen.findByText("世田谷区 発達障がい相談支援センター")).toBeTruthy();
    expect(await screen.findByText("落ち着いた環境で相談できる点が合いそうです。")).toBeTruthy();

    // TICKET-0062: D1一次データ(施設名等)とAI生成のaiNoteをラベルで区別して表示する。
    expect(screen.getByText("一次データ")).toBeTruthy();
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();
  });

  it("APIがエラーを返した場合はエラー表示に切り替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<RecommendHintSection initialTags={[]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));

    expect(await screen.findByText("相談先のヒントの取得に失敗しました。もう一度お試しください。")).toBeTruthy();
  });

  it("フォームで追加したタグを POST し、初期タグを外すとプレビューと POST から除外する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ facilities: [], isAiEnabled: true, isFallback: false, fallbackMessage: null, isCrisisResponse: false }),
        { status: 200 },
      ),
    );

    render(<RecommendHintSection initialTags={["こだわり"]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "こだわり" }));
    fireEvent.click(screen.getByRole("button", { name: "感覚" }));
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("相談分野: 感覚")).toBeTruthy();
    fireEvent.click(screen.getByText("同意して送信"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string).tags).toEqual(["感覚"]);
  });

  it("初期タグをすべて外すと、プレビューは (なし) となり POST には空配列を送る", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ facilities: [], isAiEnabled: true, isFallback: false, fallbackMessage: null, isCrisisResponse: false }),
        { status: 200 },
      ),
    );

    render(<RecommendHintSection initialTags={["こだわり"]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "こだわり" }));
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("相談分野: (なし)")).toBeTruthy();
    fireEvent.click(screen.getByText("同意して送信"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchSpy.mock.calls[0][1]?.body as string).tags).toEqual([]);
  });

  it("プレビュー中はタグ選択を変更できない", async () => {
    render(<RecommendHintSection initialTags={["こだわり"]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByText("送信内容を確認"));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByRole("group", { name: "困りごとタグ(複数選択可)" }).hasAttribute("disabled")).toBe(true);
  });

  it("autoStart を渡さない場合は従来通り入口ボタンが表示される(後方互換)", () => {
    render(<RecommendHintSection initialTags={[]} autoStart={false} />);

    expect(screen.getByRole("button", { name: "相談先のヒントを見る(任意)" })).toBeTruthy();
    expect(screen.queryByLabelText("相談したい内容")).toBeNull();
  });

  it("autoStart={true} の場合は入口ボタンを省略し、いきなりフォームが表示される", () => {
    render(<RecommendHintSection initialTags={[]} autoStart />);

    expect(screen.queryByRole("button", { name: "相談先のヒントを見る(任意)" })).toBeNull();
    expect(screen.getByLabelText("相談したい内容")).toBeTruthy();
  });

  it("年齢・区市町村をプリフィルしても相談内容が空の間は送信内容を確認できない", () => {
    render(
      <RecommendHintSection
        initialTags={["こだわり"]}
        initialLifestage="working-adult"
        initialMunicipality="台東区"
        autoStart
      />,
    );

    expect(screen.getByRole("button", { name: "社会人", pressed: true })).toBeTruthy();
    expect((screen.getByLabelText("お住まいの区市町村") as HTMLInputElement).value).toBe("台東区");
    expect((screen.getByLabelText("相談したい内容") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: "送信内容を確認" }).hasAttribute("disabled")).toBe(true);
  });

  it("結果表示から「同じ内容で再送信」を押すと、入力内容と編集済みタグを保持したまま送信内容確認画面に戻る", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ facilities: [], isAiEnabled: true, isFallback: false, fallbackMessage: null, isCrisisResponse: false }),
        { status: 200 },
      ),
    );

    render(<RecommendHintSection initialTags={["こだわり"]} />);
    openForm();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "感覚" }));
    fireEvent.click(screen.getByText("送信内容を確認"));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByText("同意して送信"));
    await screen.findByText("該当する相談先が見つかりませんでした。");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("同じ内容で再送信"));

    await screen.findByText("送信内容を確認してください。");
    // 入力内容がクリアされずに保持されていること。
    expect(screen.getByText("相談したい内容: 「会議の内容を覚えておくのが難しい」")).toBeTruthy();
    expect(screen.getByText("年齢層: 社会人")).toBeTruthy();
    expect(screen.getByText("区市町村: 世田谷区")).toBeTruthy();
    expect(screen.getByText("相談分野: こだわり、感覚")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("同意して送信"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("現在地の利用が OFF の場合、フォームを開いても現在地を要求しない", () => {
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} />);

    openForm();
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("現在地の利用が ON の場合も idle では要求せず、フォームを開くと要求する", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} />);

    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    openForm();
    await waitFor(() => expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1));
  });

  it("autoStart の場合はフォーム表示時に現在地を要求する", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} autoStart />);

    await waitFor(() => expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1));
  });

  it("東京都内の現在地から最寄りの区市町村を自動選択する", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} autoStart />);

    act(() => geo.resolve(35.6938, 139.7036));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("新宿区"),
    );
  });

  it("手入力した区市町村を遅延した現在地結果で上書きしない", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} autoStart />);

    selectMunicipality("世田谷区");
    act(() => geo.resolve(35.6938, 139.7036));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("世田谷区"),
    );
  });

  it("東京都外の現在地では区市町村を自動選択しない", async () => {
    setCurrentLocationEnabled(true);
    const geo = mockGeolocation();
    render(<RecommendHintSection initialTags={[]} autoStart />);

    act(() => geo.resolve(34.6937, 135.5023));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe(""),
    );
  });
});
