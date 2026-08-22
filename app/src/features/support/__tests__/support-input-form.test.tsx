import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SupportInputForm } from "@/features/support/components/SupportInputForm";
import { setSupportInputMemoryEnabled } from "@/features/history/services/settings";
import { __resetSupportInputSelectionForTests } from "@/features/support/hooks/useSupportInputSelection";
import { selectMunicipality } from "@/features/support/__tests__/helpers/selectMunicipality";
import {
  loadSupportInputSelection,
  saveSupportInputSelection,
} from "@/features/support/services/support-input-storage";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  push.mockClear();
  window.localStorage.clear();
  __resetSupportInputSelectionForTests();
  window.history.replaceState(null, "", "/");
});

function mockGeolocation() {
  let success: PositionCallback | undefined;
  const getCurrentPosition = vi.fn((next: PositionCallback) => { success = next; });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return { getCurrentPosition, resolve: (lat: number, lng: number) => success?.({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition) };
}

describe("SupportInputForm", () => {
  it("年齢(fieldset/legend、5区分のライフステージ選択)と検索可能な区市町村入力の2問だけで構成される(AC-1, FR-021, FR-022, TICKET-0044 AC-1)", () => {
    render(<SupportInputForm initialTags={[]} />);

    expect(screen.getByRole("group", { name: /年齢を選んでください/ })).toBeTruthy();
    expect(screen.getByText("未就学児")).toBeTruthy();
    expect(screen.getByText("小学生・中学生")).toBeTruthy();
    expect(screen.getByText("高校生")).toBeTruthy();
    expect(screen.getByText("大学生・専門学校生")).toBeTruthy();
    expect(screen.getByText("社会人")).toBeTruthy();

    const municipalityInput = screen.getByRole("combobox", { name: /お住まいの区市町村/ });
    expect(municipalityInput.getAttribute("placeholder")).toBe("区市町村名を検索");
  });

  it("保存されない旨の説明文を表示する(AC-3, NFR-32)", () => {
    render(<SupportInputForm initialTags={[]} />);

    expect(screen.getByText("入力内容は検索にのみ使います。")).toBeTruthy();
    expect(screen.getByText("端末にもサーバーにも保存されません。")).toBeTruthy();
  });

  it("既定では年齢・区市町村を選択しても保存しない", () => {
    render(<SupportInputForm initialTags={[]} />);

    fireEvent.click(screen.getByText("社会人"));
    selectMunicipality("新宿区");

    expect(window.localStorage.getItem("nd-support-input")).toBeNull();
  });

  it("年齢と地域の保存がONの場合、年齢・区市町村の選択を保存する", () => {
    setSupportInputMemoryEnabled(true);
    render(<SupportInputForm initialTags={[]} />);

    fireEvent.click(screen.getByText("小学生・中学生"));
    selectMunicipality("世田谷区");

    expect(loadSupportInputSelection()).toEqual({
      lifestage: "elementary-junior-high",
      municipality: "世田谷区",
    });
  });

  it("年齢と地域の保存がONで保存済みの選択がある場合、次回訪問時に復元する", async () => {
    setSupportInputMemoryEnabled(true);
    saveSupportInputSelection({ lifestage: "working-adult", municipality: "新宿区" });

    render(<SupportInputForm initialTags={[]} />);

    expect(await screen.findByRole("button", { name: "社会人", pressed: true })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("新宿区");
  });

  it("URLプリフィルのライフステージを選択状態で表示する", () => {
    render(<SupportInputForm initialTags={[]} initialLifestage="working-adult" />);

    expect(screen.getByRole("button", { name: "社会人", pressed: true })).toBeTruthy();
  });

  it("年齢と地域の保存がONの場合は保存する旨の案内を表示する", async () => {
    setSupportInputMemoryEnabled(true);
    render(<SupportInputForm initialTags={[]} />);

    expect(await screen.findByText("入力内容は検索に使います。")).toBeTruthy();
    expect(screen.getByText("「年齢と地域の保存」設定がONのため、次回の入力の手間を減らすためこの端末に保存されます。")).toBeTruthy();
    expect(screen.queryByText("端末にもサーバーにも保存されません。")).toBeNull();
  });

  // 2026-08是正: /settings で設定を切り替えたのち、フルリロードを伴わない画面遷移で
  // /support に戻ってきた場合(useSupportInputSelection のモジュールスコープの状態は
  // ページ遷移では初期化されない)でも、説明文が実際の保存有無と食い違わないことを確認する。
  // __resetSupportInputSelectionForTests() を呼ばずに unmount → 設定変更 → 再 render するのが
  // 実際のクライアントサイドナビゲーションの再現になる。
  it("設定変更後にこの画面を再訪問すると、モジュール状態を使い回しても最新の保存設定を反映する", async () => {
    const { unmount } = render(<SupportInputForm initialTags={[]} />);
    expect(screen.getByText("端末にもサーバーにも保存されません。")).toBeTruthy();
    unmount();

    setSupportInputMemoryEnabled(true);
    render(<SupportInputForm initialTags={[]} />);

    expect(await screen.findByText("「年齢と地域の保存」設定がONのため、次回の入力の手間を減らすためこの端末に保存されます。")).toBeTruthy();
    expect(screen.queryByText("端末にもサーバーにも保存されません。")).toBeNull();
  });

  // 上と対の確認: /settings 画面を離れずに(このコンポーネントをマウントしたまま)
  // 設定変更イベント(SETTINGS_CHANGED_EVENT)が飛んできた場合も即時反映する。
  it("マウント中に設定変更イベントを受け取ると、説明文を即時に切り替える", async () => {
    render(<SupportInputForm initialTags={[]} />);
    expect(screen.getByText("端末にもサーバーにも保存されません。")).toBeTruthy();

    act(() => {
      setSupportInputMemoryEnabled(true);
    });

    expect(await screen.findByText("「年齢と地域の保存」設定がONのため、次回の入力の手間を減らすためこの端末に保存されます。")).toBeTruthy();
  });

  it("2問とも未回答の間は送信ボタンが無効", () => {
    render(<SupportInputForm initialTags={[]} />);

    const submit = screen.getByRole("button", { name: "次へ：相談したいことを選ぶ" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("年齢と区市町村を選ぶと進めます。")).toBeTruthy();
  });

  it("未入力の項目に応じて無効CTAの理由を表示する(TICKET-0037 AC-7)", () => {
    render(<SupportInputForm initialTags={[]} />);

    fireEvent.click(screen.getByText("社会人"));
    expect(screen.getByText("区市町村を選ぶと進めます。")).toBeTruthy();

    selectMunicipality("新宿区");
    expect(screen.getByText("支援情報を検索できます。")).toBeTruthy();
  });

  it("2問に回答すると送信ボタンが有効になり、/support/purpose へクエリ付きで遷移する(AC-5)", () => {
    render(<SupportInputForm initialTags={[]} />);

    fireEvent.click(screen.getByText("未就学児"));
    selectMunicipality("新宿区");

    const submit = screen.getByRole("button", { name: "次へ：相談したいことを選ぶ" });
    expect(submit.hasAttribute("disabled")).toBe(false);

    fireEvent.click(submit);

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/support/purpose");
    expect(url.searchParams.get("age")).toBe("child");
    expect(url.searchParams.get("municipality")).toBe("13104");
    expect(url.searchParams.get("lifestage")).toBe("preschool");
    expect(url.searchParams.has("tags")).toBe(false);
  });

  it("結果画面から引き継いだタグを表示・編集し、編集後の tags クエリとして転送する", () => {
    render(<SupportInputForm initialTags={["感覚", "こころ・感情"]} />);

    expect(screen.getByRole("link", { name: "← 結果に戻る" }).getAttribute("href")).toBe("/result");
    expect(screen.getByText("引き継いだ相談分野")).toBeTruthy();
    fireEvent.click(screen.getByText("相談分野を変更する"));
    fireEvent.click(screen.getByRole("button", { name: "こだわり" }));

    fireEvent.click(screen.getByText("社会人"));
    selectMunicipality("八王子市");
    fireEvent.click(screen.getByRole("button", { name: "次へ：相談したいことを選ぶ" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("age")).toBe("adult");
    expect(url.searchParams.get("municipality")).toBe("13201");
    expect(url.searchParams.get("tags")).toBe("sensory,emotion,routine");
  });

  it("タグを切り替えると、遷移せずURLの tags クエリにも即時反映する", () => {
    window.history.replaceState(null, "", "/support?tags=sensory,emotion");
    render(<SupportInputForm initialTags={["感覚", "こころ・感情"]} />);

    fireEvent.click(screen.getByRole("button", { name: "こだわり" }));
    expect(new URLSearchParams(window.location.search).get("tags")).toBe("sensory,emotion,routine");
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "感覚" }));
    fireEvent.click(screen.getByRole("button", { name: "こころ・感情" }));
    fireEvent.click(screen.getByRole("button", { name: "こだわり" }));
    expect(new URLSearchParams(window.location.search).has("tags")).toBe(false);
  });

  it("タグが無い場合はトップへの戻るリンクを表示し、「全般」扱いとして tags クエリを付けずに転送する", () => {
    render(<SupportInputForm initialTags={[]} />);

    expect(screen.getByRole("link", { name: "← トップに戻る" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "← 結果に戻る" })).toBeNull();

    fireEvent.click(screen.getByText("未就学児"));
    selectMunicipality("千代田区");
    fireEvent.click(screen.getByRole("button", { name: "次へ：相談したいことを選ぶ" }));

    const url = new URL(push.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.has("tags")).toBe(false);
  });

  it("マウント時には現在地を要求しない", () => {
    const geo = mockGeolocation();
    render(<SupportInputForm initialTags={[]} />);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "現在地から探す" })).toBeTruthy();
  });

  it("「現在地から探す」ボタンをクリックすると現在地を要求し、最寄り区市町村を自動選択する", async () => {
    const geo = mockGeolocation();
    render(<SupportInputForm initialTags={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "現在地から探す" }));
    await waitFor(() => expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1));

    act(() => geo.resolve(35.6938, 139.7036));
    await waitFor(() => expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("新宿区"));
  });

  it("手入力を、遅延した現在地結果で上書きしない", async () => {
    const geo = mockGeolocation();
    render(<SupportInputForm initialTags={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "現在地から探す" }));
    selectMunicipality("八王子市");
    act(() => geo.resolve(35.6938, 139.7036));
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("八王子市");
  });

  it("年齢と地域の保存で復元済みの区市町村は、現在地結果で上書きしない", async () => {
    setSupportInputMemoryEnabled(true);
    saveSupportInputSelection({ lifestage: null, municipality: "八王子市" });
    const geo = mockGeolocation();

    render(<SupportInputForm initialTags={[]} />);
    await waitFor(() => expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("八王子市"));

    fireEvent.click(screen.getByRole("button", { name: "現在地から探す" }));
    act(() => geo.resolve(35.6938, 139.7036));
    expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe("八王子市");
  });

  it("東京都外の現在地は区市町村欄を空のままにする", async () => {
    const geo = mockGeolocation();
    render(<SupportInputForm initialTags={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "現在地から探す" }));
    act(() => geo.resolve(34.6937, 135.5023));
    await waitFor(() => expect((screen.getByRole("combobox", { name: /お住まいの区市町村/ }) as HTMLInputElement).value).toBe(""));
  });

});
