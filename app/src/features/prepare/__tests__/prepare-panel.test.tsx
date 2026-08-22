import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreparePanel } from "@/features/prepare/components/PreparePanel";
import { selectMunicipality } from "@/features/support/__tests__/helpers/selectMunicipality";

afterEach(() => {
  vi.restoreAllMocks();
});

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: /相談メモを作る/ }));
}

function fillFormAndPreview() {
  openForm();
  fireEvent.click(screen.getByRole("button", { name: "社会人" }));
  selectMunicipality("世田谷区");
  fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
}

const VALID_RESPONSE = {
  summary: "困りごとの要約です。",
  checklist: ["伝えること1"],
  flow: ["流れ1"],
  questions: ["質問1"],
  facilities: [],
  isFallback: false,
  fallbackMessage: null,
};

describe("PreparePanel(TICKET-0046)", () => {
  it("自由記述入力欄(textarea/text input)を一切持たない(AC-2)", () => {
    render(<PreparePanel topCategories={["executive-function"]} initialTags={[]} />);
    openForm();

    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("初期状態ではボタンのみで、フォームは表示されない", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} />);

    expect(screen.getByRole("button", { name: /相談メモを作る/ })).toBeTruthy();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
  });

  it("年齢は SupportInputForm と同じ5区分ライフステージの選択肢を表示し、旧2択(18歳未満/以上)は表示しない", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    openForm();

    expect(screen.getByRole("button", { name: "未就学児" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "小学生・中学生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "高校生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "大学生・専門学校生" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "社会人" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "18歳未満" })).toBeNull();
    expect(screen.queryByRole("button", { name: "18歳以上" })).toBeNull();
  });

  it("困りごとタグは初期選択(結果画面から引き継いだタグ)された状態で表示される", () => {
    render(<PreparePanel topCategories={[]} initialTags={["感覚"]} />);
    openForm();

    expect(screen.getByRole("button", { name: "感覚" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("年齢・区市町村を選ぶまで「送信内容を確認」は無効", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    openForm();

    expect(
      (screen.getByRole("button", { name: "送信内容を確認" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("年齢と地域を入力すると、送信内容を確認できます。")).toBeTruthy();
    expect((screen.getByText("基本情報を入力・変更").closest("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("任意の詳しい状況は選択数を表示し、選択中も折りたたみを開いたままにする", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    openForm();

    fireEvent.click(screen.getByText(/3\. 詳しい状況を追加する/));
    fireEvent.click(screen.getByRole("button", { name: "学校・園で" }));

    expect(screen.getByText(/任意・1項目選択済み/)).toBeTruthy();
    expect((screen.getByText(/3\. 詳しい状況を追加する/).closest("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("年齢・区市町村のプリフィル時はフォームが入力済みかつ送信内容確認を有効にする", () => {
    render(
      <PreparePanel
        topCategories={[]}
        initialTags={[]}
        autoStart
        initialLifestage="working-adult"
        initialMunicipality="台東区"
      />,
    );

    expect(screen.getByRole("button", { name: "社会人" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("台東区");
    expect((screen.getByRole("button", { name: "送信内容を確認" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("プレビューを開いただけでは fetch を一切発行しない(FR-041)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={["executive-function"]} initialTags={["不注意・段取り"]} />);
    fillFormAndPreview();

    await screen.findByText("送信内容を確認してください。");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("プレビュー中は区市町村コンボボックスと困りごとタグを無効化する", async () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    fillFormAndPreview();

    await screen.findByText("送信内容を確認してください。");
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("group", { name: "困りごとタグ(複数選択可)" }) as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("プレビューには送信されるもの(タグ・相談の対象・年齢層・区市町村)と送信されないもの(自由記述)を明示する", async () => {
    render(<PreparePanel topCategories={["executive-function"]} initialTags={["不注意・段取り"]} />);
    fillFormAndPreview();

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("困りごとタグ: 不注意・段取り")).toBeTruthy();
    expect(screen.getByText("相談の対象: 自分について")).toBeTruthy();
    expect(screen.getByText("年齢層: 社会人")).toBeTruthy();
    expect(screen.getByText("区市町村: 世田谷区")).toBeTruthy();
    expect(screen.getByText("アンケートの回答内容そのもの・自由記述")).toBeTruthy();
  });

  it("「メモを作成する」をクリックしてはじめて /api/prepare へ fetch する", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={["executive-function"]} initialTags={["不注意・段取り"]} />);
    fillFormAndPreview();
    await screen.findByText("送信内容を確認してください。");

    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/prepare",
      expect.objectContaining({
        method: "POST",
        // duration/lifeStatus/consultPurpose/contactMethod は未選択時 undefined のため、
        // JSON.stringify の仕様上プロパティごと出力から除外される(値が [] の配列系フィールドは
        // 除外されずキーとして残る)。
        body: JSON.stringify({
          topCategories: ["executive-function"],
          tags: ["不注意・段取り"],
          age: "adult",
          lifestage: "working-adult",
          municipality: "世田谷区",
          relationship: "self",
          situations: [],
          accommodations: [],
          priorSupport: [],
        }),
      }),
    );

    expect(await screen.findByText("困りごとの要約です。")).toBeTruthy();
  });

  it("18歳未満相当のライフステージ(高校生)を選ぶと、送信する age は child に導出される", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    openForm();
    fireEvent.click(screen.getByRole("button", { name: "高校生" }));
    selectMunicipality("世田谷区");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("年齢層: 高校生")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ age: "child", lifestage: "high-school" });
  });

  it("initialLifestage でプリフィルされた状態で表示される(旧 initialAgeGroup からの置き換え)", () => {
    render(
      <PreparePanel
        topCategories={[]}
        initialTags={[]}
        autoStart
        initialLifestage="high-school"
        initialMunicipality="台東区"
      />,
    );

    expect(screen.getByRole("button", { name: "高校生" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("台東区");
  });

  it("結果表示には印刷・コピーの操作が両方表示される(AC-3)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    fillFormAndPreview();
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));

    await screen.findByText("困りごとの要約です。");
    expect(screen.getByRole("button", { name: /印刷する/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /コピーする/ })).toBeTruthy();
  });

  it("相談の対象の既定は「自分について」で、選び直すとプレビュー・送信内容に反映される(TICKET-0047)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={["executive-function"]} initialTags={["不注意・段取り"]} />);
    openForm();

    expect(screen.getByRole("button", { name: "自分について" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "子ども・家族について" }));
    fireEvent.click(screen.getByRole("button", { name: "社会人" }));
    selectMunicipality("世田谷区");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText("相談の対象: 子ども・家族について")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ relationship: "guardian" });
  });

  it("API がエラーを返した場合はエラー表示に切り替わる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 500 }));

    render(<PreparePanel topCategories={[]} initialTags={[]} />);
    fillFormAndPreview();
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));

    expect(await screen.findByText("相談メモの取得に失敗しました。もう一度お試しください。")).toBeTruthy();
  });

  it("autoStart を渡さない場合は従来通り入口ボタンが表示される(後方互換)", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} autoStart={false} />);

    expect(screen.getByRole("button", { name: /相談メモを作る/ })).toBeTruthy();
    expect(screen.queryByLabelText("お住まいの区市町村")).toBeNull();
  });

  it("autoStart={true} の場合は入口ボタンを省略し、いきなりフォームが表示される", () => {
    render(<PreparePanel topCategories={[]} initialTags={[]} autoStart />);

    expect(screen.queryByRole("button", { name: /相談メモを作る/ })).toBeNull();
    expect(screen.getByLabelText("お住まいの区市町村")).toBeTruthy();
  });

  it("結果表示から「同じ内容で再送信」を押すと、選択内容(タグ・年齢層・区市町村・相談の対象)を保持したまま送信内容確認画面に戻る", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));

    render(<PreparePanel topCategories={["executive-function"]} initialTags={["不注意・段取り"]} />);
    openForm();
    fireEvent.click(screen.getByRole("button", { name: "子ども・家族について" }));
    fireEvent.click(screen.getByRole("button", { name: "社会人" }));
    selectMunicipality("世田谷区");
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));
    await screen.findByText("困りごとの要約です。");

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "同じ内容で再送信" }));

    await screen.findByText("送信内容を確認してください。");
    // 選択内容がクリアされずに保持されていること。
    expect(screen.getByText("困りごとタグ: 不注意・段取り")).toBeTruthy();
    expect(screen.getByText("相談の対象: 子ども・家族について")).toBeTruthy();
    expect(screen.getByText("年齢層: 社会人")).toBeTruthy();
    expect(screen.getByText("区市町村: 世田谷区")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "メモを作成する" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});
