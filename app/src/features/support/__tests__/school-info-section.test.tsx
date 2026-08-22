import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SchoolInfoSection は SchoolCard(掲載情報の訂正・更新報告リンクの href 組み立てに
// usePathname()/useSearchParams() を使う)を内包するため、next/navigation をモックする。
vi.mock("next/navigation", () => ({
  usePathname: () => "/support/results",
  useSearchParams: () => new URLSearchParams("age=child&municipality=%E5%8F%B0%E6%9D%B1%E5%8C%BA"),
}));

import { SchoolInfoSection } from "@/features/support/components/SchoolInfoSection";

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Map: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({ title, onClick, children }: { title?: string; onClick?: () => void; children?: ReactNode }) =>
    onClick ? <button type="button" aria-label={title} onClick={onClick}>{children}</button> : <div aria-label={title}>{children}</div>,
  Pin: () => null,
  InfoWindow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function renderSection() { return render(<SchoolInfoSection municipality="台東区" schools={{ elementary: Array.from({ length: 5 }, (_, index) => ({ name: `小学校${index + 1}`, level: "elementary" as const, fixedClasses: [] })), juniorHigh: [] }} highSchoolPathways={[]} classOrganizations={[]} limitations={["調査中"]} surveyDate={null} />); }

describe("SchoolInfoSection", () => {
  it("位置情報がない場合は地図表示ボタンを出さず、一覧を表示する", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: /地図を表示/ })).toBeNull();
    expect(screen.getByText("小学校1")).toBeTruthy();
  });

  it("選択数に上限は無く、比較から一覧へ戻ると復帰先へフォーカスする", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "比較する" }));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    checkboxes.forEach((checkbox) => expect((checkbox as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "比較する(5件)" }));
    expect(screen.getByRole("heading", { name: "学校の比較" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("高校進学・学級編制・データの限界情報がある場合は、対応するサブタブに切り替えるとそれぞれ表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [], juniorHigh: [] }} highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]} classOrganizations={[{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }]} limitations={["調査中"]} surveyDate={null} />);

    // 小学校・中学校が0件のため、既定タブは内容がある最初のタブ(高校)になる。
    expect(screen.getByText("高校進学(チャレンジ/エンカレッジ)")).toBeTruthy();
    expect(screen.queryByText("学級編制の判定")).toBeNull();
    expect(screen.queryByText("データの限界")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "制度・データ" }));
    expect(screen.getByText("学級編制の判定")).toBeTruthy();
    expect(screen.getByText("データの限界")).toBeTruthy();
    expect(screen.queryByText("高校進学(チャレンジ/エンカレッジ)")).toBeNull();
  });
});

describe("SchoolInfoSection: 小学校・中学校のサブタブ分割", () => {
  it("小学校タブと中学校タブに分かれ、既定では小学校タブのみを表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByRole("tab", { name: /^小学校/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.queryByText("御徒町台東中学校")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /^中学校/ }));
    expect(screen.getByRole("tab", { name: /^中学校/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("御徒町台東中学校")).toBeTruthy();
    expect(screen.queryByText("上野小学校")).toBeNull();
  });

  it("0件のサブタブはタブ自体を表示しない", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByRole("tab", { name: /^小学校/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /^中学校/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /^高校/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: "制度・データ" })).toBeNull();
  });

  it("4区分すべてが0件の場合は、空のUIを避けるため全タブを表示にフォールバックする", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [], juniorHigh: [] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByRole("tab", { name: /^小学校/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^中学校/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^高校/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "制度・データ" })).toBeTruthy();
  });

  it("各サブタブのバッジに段階ごとの件数を表示する(制度・データには件数を出さない)", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }] }} highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]} classOrganizations={[]} limitations={["調査中"]} surveyDate={null} />);

    expect(screen.getByRole("tab", { name: /^小学校/ }).textContent).toBe("小学校1");
    expect(screen.getByRole("tab", { name: /^中学校/ }).textContent).toBe("中学校1");
    expect(screen.getByRole("tab", { name: /^高校/ }).textContent).toBe("高校1");
    expect(screen.getByRole("tab", { name: "制度・データ" }).textContent).toBe("制度・データ");
  });

  it("矢印キーでタブ間をロービングフォーカスし、Enter相当のクリックで切り替わる", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    const elementaryTab = screen.getByRole("tab", { name: /^小学校/ });
    elementaryTab.focus();
    fireEvent.keyDown(elementaryTab, { key: "ArrowRight" });

    const juniorHighTab = screen.getByRole("tab", { name: /^中学校/ });
    expect(document.activeElement).toBe(juniorHighTab);
    expect(juniorHighTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("御徒町台東中学校")).toBeTruthy();
  });

  it("サブタブを切り替えると、比較のための選択状態はリセットされる", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }, { name: "大正小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    fireEvent.click(screen.getByRole("button", { name: "比較する" }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("button", { name: "比較する(1件)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^中学校/ }));

    expect(screen.queryByRole("button", { name: /比較する\(/ })).toBeNull();
    expect(screen.getByRole("button", { name: "比較する" })).toBeTruthy();
  });

  it("サブタブを切り替えると、分類バッジによる絞り込みは解除される", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [], resourceRoom: { hasResourceRoom: true, isHubSchool: true, groupName: "いたどり教室" } }, { name: "大正小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [{ name: "御徒町台東中学校", level: "junior_high", fixedClasses: [] }] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    fireEvent.click(screen.getByRole("button", { name: "いたどり教室" }));
    expect(screen.getByRole("button", { name: "いたどり教室の絞り込みを解除" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^中学校/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^小学校/ }));

    expect(screen.queryByRole("button", { name: "いたどり教室の絞り込みを解除" })).toBeNull();
    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.getByText("大正小学校")).toBeTruthy();
  });
});

describe("SchoolInfoSection: 高校進学先のみの表示(lifestage=high-school 相当)", () => {
  it("学校一覧が空の場合、一覧/地図の表示切替や地図UIを表示せず、進学先カードには「高校」バッジを表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [], juniorHigh: [] }} highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.queryByRole("button", { name: /地図を表示/ })).toBeNull();
    expect(screen.getByText("高校進学(チャレンジ/エンカレッジ)")).toBeTruthy();
    const card = screen.getByText("チャレンジスクールA").closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("高校")).toBeTruthy();
  });
});

describe("SchoolInfoSection: 全区分が空の場合(preschool/university-vocational/working-adult 相当)", () => {
  it("クラッシュせず、学校一覧UI・高校進学・学級編制・データの限界のいずれも空の入れ物として表示しない", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [], juniorHigh: [] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByRole("heading", { name: "学校情報(台東区)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /地図を表示/ })).toBeNull();
    expect(screen.queryByText("高校進学(チャレンジ/エンカレッジ)")).toBeNull();
    expect(screen.queryByText("学級編制の判定")).toBeNull();
    expect(screen.queryByText("データの限界")).toBeNull();
    // 全区分0件のため既定タブは小学校になり、空状態の案内文を表示する。
    expect(screen.getByText("小学校の情報は登録されていません。")).toBeTruthy();
  });
});

describe("SchoolInfoSection: 高校進学先の連絡先ボタン(電話する/詳細を見る)", () => {
  it("進学先に phone がある場合は「電話する」ボタンを tel: リンク(ハイフン除去)として表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", phone: "03-1234-5678" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const link = screen.getByRole("button", { name: /電話する/ });
    expect(link.getAttribute("href")).toBe("tel:0312345678");
  });

  it("進学先に url がある場合は「詳細を見る」ボタンをそのURLへのリンクとして表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", url: "https://example-highschool.tokyo.jp" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const link = screen.getByRole("button", { name: /詳細を見る/ });
    expect(link.getAttribute("href")).toBe("https://example-highschool.tokyo.jp");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("進学先に url/phone のいずれも無い場合、電話する・詳細を見るのいずれも表示しないが、地図で探すボタンは表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByRole("button", { name: /電話する/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /詳細を見る/ })).toBeNull();
    expect(screen.getByRole("button", { name: /地図で探す/ })).toBeTruthy();
  });
});

describe("SchoolInfoSection: 高校進学先の住所・電話のテキスト表示", () => {
  it("進学先に address がある場合、住所をテキストとして表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", address: "東京都台東区上野1-1-1" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByText("東京都台東区上野1-1-1")).toBeTruthy();
  });

  it("進学先に address が無い場合、住所テキストを表示しない", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByText("東京都台東区上野1-1-1")).toBeNull();
  });

  it("進学先に phone がある場合、「電話する」ボタンとは別に電話番号そのものをテキストとして表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", phone: "03-1234-5678" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByText("03-1234-5678")).toBeTruthy();
    expect(screen.getByRole("button", { name: /電話する/ })).toBeTruthy();
  });
});

describe("SchoolInfoSection: 高校進学先の通学メモ・最寄駅", () => {
  it("進学先に commuteNote がある場合、テキストとして表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", commuteNote: "通学時間は乗り換え込みで約40分" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByText("通学時間は乗り換え込みで約40分")).toBeTruthy();
  });

  it("進学先に nearestStation がある場合、テキストとして表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", nearestStation: "上野駅" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByText("上野駅")).toBeTruthy();
  });

  it("進学先に commuteNote/nearestStation のいずれも無い場合、表示しない", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByText("通学時間は乗り換え込みで約40分")).toBeNull();
    expect(screen.queryByText("上野駅")).toBeNull();
  });
});

describe("SchoolInfoSection: 高校進学先の地図で探すボタン", () => {
  it("常にGoogleマップの検索結果へのリンクをボタンとして表示する(address がある場合はaddressをクエリに使う)", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", address: "東京都台東区上野1-1-1" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("東京都台東区上野1-1-1")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("address が無い場合、進学先名をクエリとして使う", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("チャレンジスクールA")}`,
    );
  });

  it("電話・URLがどちらも無い場合でも地図で探すボタンは表示される", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByRole("button", { name: "地図で探す" })).toBeTruthy();
  });

  it("電話するボタンは単独で全幅の行として表示され、詳細を見る/地図で探すとは別の行になる", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", phone: "03-1234-5678", url: "https://example-highschool.tokyo.jp" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const phoneButton = screen.getByRole("button", { name: /電話する/ });
    const urlButton = screen.getByRole("button", { name: /詳細を見る/ });
    const mapButton = screen.getByRole("button", { name: "地図で探す" });

    expect(phoneButton.parentElement).not.toBe(urlButton.parentElement);
    expect(urlButton.parentElement).toBe(mapButton.parentElement);
  });
});

describe("SchoolInfoSection: 近い順の並び替え", () => {
  it("一覧のみモードでは「標準」と「近い順」の2つの並び順を選べる(現在地の利用は既定オフのため「近い順(現在地)」は出ない)", () => {
    renderSection();

    expect(screen.getByRole("option", { name: "標準" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "近い順" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "近い順(現在地)" })).toBeNull();
  });

  it("「近い順」を選ぶと同じサブタブ内(小学校)で台東区中心からの距離が近い順になる", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{
          elementary: [
            { name: "遠い小学校", level: "elementary", fixedClasses: [], lat: 35.5, lng: 139.5 },
            { name: "近い小学校", level: "elementary", fixedClasses: [], lat: 35.713, lng: 139.781 },
          ],
          juniorHigh: [],
        }}
        highSchoolPathways={[]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    // 標準(既定)は付与順。
    expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      "遠い小学校",
      "近い小学校",
    ]);

    fireEvent.change(screen.getByLabelText("並び替え"), { target: { value: "distance" } });

    expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      "近い小学校",
      "遠い小学校",
    ]);
  });

  it("座標が無い学校は「近い順」でも除外されず、末尾に回される", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{
          elementary: [
            { name: "座標なし小学校", level: "elementary", fixedClasses: [] },
            { name: "近い小学校", level: "elementary", fixedClasses: [], lat: 35.713, lng: 139.781 },
          ],
          juniorHigh: [],
        }}
        highSchoolPathways={[]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("並び替え"), { target: { value: "distance" } });

    expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual([
      "近い小学校",
      "座標なし小学校",
    ]);
  });

  it("地図を表示できない場合も、一覧の並び替えを表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [{ name: "上野小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [] }}
        highSchoolPathways={[]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByLabelText("並び替え")).toBeTruthy();
  });

  it("学校一覧が空の場合(lifestage=high-school 相当)は並び替えを表示しない", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByLabelText("並び替え")).toBeNull();
  });
});

describe("SchoolInfoSection: viewMode(表示方法、FacilityListSectionと共通の一覧/地図切替UIを利用)", () => {
  const mappableSchools = { elementary: [{ name: "上野小学校", level: "elementary" as const, fixedClasses: [], lat: 35.713, lng: 139.781 }], juniorHigh: [] };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-api-key");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("viewMode の既定値(list)では一覧のみを表示し、地図は表示しない", () => {
    render(<SchoolInfoSection municipality="台東区" schools={mappableSchools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("viewMode='list-map' の場合は一覧と地図を並べて表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={mappableSchools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} viewMode="list-map" />);

    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.getByTestId("map")).toBeTruthy();
  });

  it("viewMode='map' の場合は一覧を隠し地図のみを表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={mappableSchools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} viewMode="map" />);

    expect(screen.queryByText("上野小学校")).toBeNull();
    expect(screen.getByTestId("map")).toBeTruthy();
  });

  it("地図に表示できる位置情報を持つ学校が1件も無い場合は viewMode='map' が指定されても一覧のみ表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "座標なし小学校", level: "elementary", fixedClasses: [] }], juniorHigh: [] }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} viewMode="map" />);

    expect(screen.getByText("座標なし小学校")).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
  });
});

describe("SchoolInfoSection: 分類バッジのクリックによる絞り込み", () => {
  const schools = {
    elementary: [
      { name: "上野小学校", level: "elementary" as const, fixedClasses: [], resourceRoom: { hasResourceRoom: true, isHubSchool: true, groupName: "いたどり教室" } },
      { name: "大正小学校", level: "elementary" as const, fixedClasses: [{ disabilityType: "intellectual" as const, status: "confirmed" as const }] },
    ],
    juniorHigh: [
      { name: "御徒町台東中学校", level: "junior_high" as const, fixedClasses: [] },
    ],
  };

  it("バッジをクリックすると、そのバッジを持つ学校のみに絞り込み、絞り込み中のチップを表示する", () => {
    render(<SchoolInfoSection municipality="台東区" schools={schools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    fireEvent.click(screen.getByRole("button", { name: "いたどり教室" }));

    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.queryByText("大正小学校")).toBeNull();
    expect(screen.getByRole("button", { name: "いたどり教室の絞り込みを解除" })).toBeTruthy();
  });

  it("絞り込み中のチップをクリックすると解除され、同じサブタブ内の元の一覧に戻る", () => {
    render(<SchoolInfoSection municipality="台東区" schools={schools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    fireEvent.click(screen.getByRole("button", { name: "いたどり教室" }));
    fireEvent.click(screen.getByRole("button", { name: "いたどり教室の絞り込みを解除" }));

    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.getByText("大正小学校")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "いたどり教室の絞り込みを解除" })).toBeNull();
  });

  it("複数のバッジを選ぶといずれかに一致する学校を表示し(OR条件)、すべて解除で一括解除できる", () => {
    render(<SchoolInfoSection municipality="台東区" schools={schools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    // まず「大正小学校」だけが持つバッジで絞り込む。
    fireEvent.click(screen.getByRole("button", { name: "知的障害・確認済み" }));
    expect(screen.getByText("大正小学校")).toBeTruthy();
    expect(screen.queryByText("上野小学校")).toBeNull();

    // 絞り込み後も表示され続ける「大正小学校」カード上の「小学校」バッジを追加で選ぶと、
    // 同じ学年段階の「上野小学校」も一致するようになる(OR条件で対象が広がる)。
    fireEvent.click(screen.getByRole("button", { name: "小学校" }));
    expect(screen.getByText("大正小学校")).toBeTruthy();
    expect(screen.getByText("上野小学校")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));

    expect(screen.getByText("大正小学校")).toBeTruthy();
    expect(screen.getByText("上野小学校")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "すべて解除" })).toBeNull();
  });

  it("絞り込み後にデータが入れ替わり同じサブタブ内で一致する学校が無くなった場合は解除案内を表示する", () => {
    const { rerender } = render(<SchoolInfoSection municipality="台東区" schools={schools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    fireEvent.click(screen.getByRole("button", { name: "いたどり教室" }));
    expect(screen.getByText("上野小学校")).toBeTruthy();

    rerender(<SchoolInfoSection municipality="台東区" schools={{ elementary: [{ name: "松葉小学校", level: "elementary", fixedClasses: [] }], juniorHigh: schools.juniorHigh }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.getByText("この条件に一致する学校は見つかりませんでした。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "フィルタを解除する" }));
    expect(screen.getByText("松葉小学校")).toBeTruthy();
  });

  it("サブタブの学校自体が0件になり、そのタブが非表示になった場合は表示中の別タブへ自動的に切り替わる", () => {
    const { rerender } = render(<SchoolInfoSection municipality="台東区" schools={schools} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    rerender(<SchoolInfoSection municipality="台東区" schools={{ elementary: [], juniorHigh: schools.juniorHigh }} highSchoolPathways={[]} classOrganizations={[]} limitations={[]} surveyDate={null} />);

    expect(screen.queryByRole("tab", { name: /^小学校/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /^中学校/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("御徒町台東中学校")).toBeTruthy();
  });
});

describe("SchoolInfoSection: 高校進学先の出典・更新情報(報告リンク・AskAiPanelはスコープ外)", () => {
  it("sources がある場合、折りたたみ(出典・更新情報)としてlabel・confirmedOnを表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school", sources: [{ label: "都教育委員会公表資料", url: "https://example.metro.tokyo.jp", confirmedOn: "2026-07-01" }] }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.getByText("出典・更新情報").closest("summary")).toBeTruthy();
    const link = screen.getByRole("link", { name: "都教育委員会公表資料" });
    expect(link.getAttribute("href")).toBe("https://example.metro.tokyo.jp");
    expect(screen.getByText(/2026-07-01/)).toBeTruthy();
  });

  it("sources が無い場合、出典・更新情報の折りたたみを表示しない", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[{ name: "チャレンジスクールA", pathwayType: "challenge_school" }]}
        classOrganizations={[]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByText("出典・更新情報")).toBeNull();
  });
});

describe("SchoolInfoSection: 学級編制の判定の出典(トグル無しのインライン表示)", () => {
  it("sources がある場合、判断ボックス内にインラインで出典を表示する", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[]}
        classOrganizations={[{ level: "elementary", judgement: "separate", rationale: "テスト根拠", sources: [{ label: "教育委員会資料", url: "https://example.city.taito.lg.jp", confirmedOn: "2026-06-01" }] }]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    const link = screen.getByRole("link", { name: "教育委員会資料" });
    expect(link.getAttribute("href")).toBe("https://example.city.taito.lg.jp");
    expect(screen.getByText(/2026-06-01/)).toBeTruthy();
  });

  it("sources が無い場合、出典行を表示しない", () => {
    render(
      <SchoolInfoSection
        municipality="台東区"
        schools={{ elementary: [], juniorHigh: [] }}
        highSchoolPathways={[]}
        classOrganizations={[{ level: "elementary", judgement: "separate", rationale: "テスト根拠" }]}
        limitations={[]}
        surveyDate={null}
      />,
    );

    expect(screen.queryByText(/出典:/)).toBeNull();
  });
});
