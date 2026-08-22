import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurposeSelectionForm } from "@/features/support/components/PurposeSelectionForm";
import { PURPOSE_OPTIONS_BY_LIFESTAGE } from "@/features/support/constants/purpose-options";
import { CRISIS_GUIDANCE_TEXT } from "@/features/ai-summary/services/prompt";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  push.mockClear();
});

describe("PurposeSelectionForm", () => {
  it("指定したlifestageに対応する目的ボタンがすべて表示される(preschool=6件)", () => {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={[]}
        lifestageLabel="未就学児"
      />,
    );

    const options = PURPOSE_OPTIONS_BY_LIFESTAGE.preschool;
    expect(options.length).toBe(6);
    for (const option of options) {
      expect(screen.getByText(option.label)).toBeTruthy();
    }
  });

  it("「それ以外」ボタンを表示する", () => {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={[]}
        lifestageLabel="未就学児"
      />,
    );

    expect(screen.getByRole("button", { name: "それ以外" })).toBeTruthy();
  });

  it("具体的な目的ボタンをクリックすると、/support/results へ purpose 付きで遷移し、age/municipality/lifestage/tags を引き継ぐ", () => {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={["こだわり"]}
        lifestageLabel="未就学児"
      />,
    );

    fireEvent.click(screen.getByText("児童発達支援・療育を利用したい"));

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/support/results");
    expect(url.searchParams.get("purpose")).toBe("use-day-service");
    expect(url.searchParams.get("age")).toBe("child");
    expect(url.searchParams.get("municipality")).toBe("13104");
    expect(url.searchParams.get("lifestage")).toBe("preschool");
    expect(url.searchParams.get("tags")).toBe("routine");
  });

  it("「それ以外」をクリックすると textarea が表示される", () => {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={[]}
        lifestageLabel="未就学児"
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "それ以外" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("それ以外を選び入力後に「一覧を見る」を押すと、purpose を付けず、入力テキストもURLに含めずに /support/results へ遷移する(プライバシー回帰防止)", () => {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={["こだわり"]}
        lifestageLabel="未就学児"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "それ以外" }));
    const secretText = "とても個人的な相談内容についての秘密のテキスト";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: secretText } });

    fireEvent.click(screen.getByRole("button", { name: "一覧を見る" }));

    expect(push).toHaveBeenCalledTimes(1);
    const pushedUrl: string = push.mock.calls[0][0];
    const url = new URL(pushedUrl, "http://localhost");
    expect(url.pathname).toBe("/support/results");
    expect(url.searchParams.has("purpose")).toBe(false);
    expect(url.searchParams.get("age")).toBe("child");
    expect(url.searchParams.get("municipality")).toBe("13104");
    expect(url.searchParams.get("lifestage")).toBe("preschool");
    expect(url.searchParams.get("tags")).toBe("routine");
    expect(pushedUrl.includes(secretText)).toBe(false);
    expect(pushedUrl).not.toContain(encodeURIComponent(secretText));
  });

  it("「戻る」リンクの href が /support?lifestage=...&municipality=... になっている", () => {
    render(
      <PurposeSelectionForm
        lifestage="high-school"
        municipality="八王子市"
        municipalityCode="13201"
        ageGroup="child"
        tags={[]}
        lifestageLabel="高校生"
      />,
    );

    const backLink = screen.getByRole("link", { name: "← 年齢・地域の選択に戻る" });
    expect(backLink.getAttribute("href")).toBe(
      `/support?${new URLSearchParams({ municipality: "13201", lifestage: "high-school" }).toString()}`,
    );
  });
});

// 「それ以外」フローの OtherStep ステートマシン(/api/purpose-pickup 呼び出し)のテスト。
// 上記6件の既存テストは変更せず、末尾に追記する。
describe("PurposeSelectionForm の「それ以外」AIピックアップフロー", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderForm() {
    render(
      <PurposeSelectionForm
        lifestage="preschool"
        municipality="新宿区"
        municipalityCode="13104"
        ageGroup="child"
        tags={[]}
        lifestageLabel="未就学児"
      />,
    );
  }

  function goToPreview(text: string) {
    fireEvent.click(screen.getByRole("button", { name: "それ以外" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "送信内容を確認" }));
  }

  it("「それ以外」→ テキスト入力 →「送信内容を確認」で、プレビュー画面に入力テキストが表示される", async () => {
    renderForm();

    const text = "会議の内容を覚えておくのが難しい";
    goToPreview(text);

    await screen.findByText("送信内容を確認してください。");
    expect(screen.getByText(`入力テキスト: 「${text}」`)).toBeTruthy();
  });

  it("プレビューで「同意して送信」をクリックすると /api/purpose-pickup へ POST し、bodyにtrim済みfreeTextとlifestageを含む", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ matchedPurposeId: null, isAiEnabled: true, isCrisisResponse: false }), {
        status: 200,
      }),
    );

    renderForm();
    const rawText = "  会議の内容を覚えておくのが難しい  ";
    goToPreview(rawText);
    await screen.findByText("送信内容を確認してください。");

    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/purpose-pickup");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ freeText: rawText.trim(), lifestage: "preschool" });
  });

  it("マッチした目的が返った場合、AI由来ラベルとマッチしたラベルを表示し、「この目的で探す」でpurpose付きで遷移する(自由記述はURLに含まれない、プライバシー回帰防止)", async () => {
    const matchedId = "use-day-service";
    const matchedLabel = PURPOSE_OPTIONS_BY_LIFESTAGE.preschool.find((option) => option.id === matchedId)?.label;
    expect(matchedLabel).toBeTruthy();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ matchedPurposeId: matchedId, isAiEnabled: true, isCrisisResponse: false }), {
        status: 200,
      }),
    );

    renderForm();
    const secretText = "とても個人的な相談内容についての秘密のテキスト";
    goToPreview(secretText);
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByText(`AIが選んだ目的: ${matchedLabel}`)).toBeTruthy();
    expect(screen.getByText("AIによる要約(参考情報)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "この目的で探す" }));

    expect(push).toHaveBeenCalledTimes(1);
    const pushedUrl: string = push.mock.calls[0][0];
    const url = new URL(pushedUrl, "http://localhost");
    expect(url.pathname).toBe("/support/results");
    expect(url.searchParams.get("purpose")).toBe(matchedId);
    expect(pushedUrl.includes(secretText)).toBe(false);
    expect(pushedUrl).not.toContain(encodeURIComponent(secretText));
  });

  it("マッチしなかった場合、見つからなかった旨の文言と「一覧を見る」ボタンを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ matchedPurposeId: null, isAiEnabled: true, isCrisisResponse: false }), {
        status: 200,
      }),
    );

    renderForm();
    goToPreview("困りごと");
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByText(/当てはまる目的が見つかりませんでした/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "一覧を見る" })).toBeTruthy();
  });

  it("危機介入レスポンス(isCrisisResponse=true)の場合、CRISIS_GUIDANCE_TEXTを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ matchedPurposeId: null, isAiEnabled: false, isCrisisResponse: true }), {
        status: 200,
      }),
    );

    renderForm();
    goToPreview("困りごと");
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByText(CRISIS_GUIDANCE_TEXT)).toBeTruthy();
  });

  it("fetchがres.ok=falseを返す場合(例: 429)、エラーメッセージと「同じ内容で再送信」「もう一度入力する」ボタンを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "リクエストが集中しています。" } }), {
        status: 429,
      }),
    );

    renderForm();
    goToPreview("困りごと");
    await screen.findByText("送信内容を確認してください。");
    fireEvent.click(screen.getByRole("button", { name: "同意して送信" }));

    expect(await screen.findByRole("button", { name: "同じ内容で再送信" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "もう一度入力する" })).toBeTruthy();
  });
});
