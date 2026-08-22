import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SCHOOL_LEVEL_LABELS, SchoolCard } from "@/features/support/components/SchoolCard";
import type { School } from "@/features/support/components/SchoolCard";

function makeSchool(overrides: Partial<School> = {}): School {
  return {
    name: "上野小学校",
    level: "elementary",
    fixedClasses: [],
    ...overrides,
  };
}

describe("SchoolCard: 学年段階バッジ(showLevel)", () => {
  it("showLevel を省略した場合(既定値 true)、小学校には「小学校」バッジを表示する", () => {
    render(<SchoolCard school={makeSchool({ level: "elementary", name: "上野小学校" })} schools={[]} municipality="台東区" />);

    expect(screen.getByText(SCHOOL_LEVEL_LABELS.elementary)).toBeTruthy();
  });

  it("showLevel を省略した場合(既定値 true)、中学校には「中学校」バッジを表示する", () => {
    render(<SchoolCard school={makeSchool({ level: "junior_high", name: "御徒町台東中学校" })} schools={[]} municipality="台東区" />);

    expect(screen.getByText(SCHOOL_LEVEL_LABELS.junior_high)).toBeTruthy();
  });

  it("showLevel={false} の場合、学年段階バッジを表示しない", () => {
    render(<SchoolCard school={makeSchool({ level: "elementary" })} schools={[]} municipality="台東区" showLevel={false} />);

    expect(screen.queryByText(SCHOOL_LEVEL_LABELS.elementary)).toBeNull();
    expect(screen.queryByText(SCHOOL_LEVEL_LABELS.junior_high)).toBeNull();
  });

  it("バッジの行(Row A)は学校名を含む行(Row B)の直前に表示される", () => {
    render(<SchoolCard school={makeSchool({ level: "elementary", name: "上野小学校" })} schools={[]} municipality="台東区" />);

    const badge = screen.getByText(SCHOOL_LEVEL_LABELS.elementary);
    const name = screen.getByText("上野小学校");
    const badgeRow = badge.parentElement?.parentElement;
    const nameRow = name.parentElement;
    expect(badgeRow?.nextElementSibling).toBe(nameRow);
    expect(nameRow?.firstElementChild).toBe(name);
  });
});

describe("SchoolCard: 学校公式サイトへのリンク(詳細を見る)", () => {
  it("school.url が設定されている場合、「詳細を見る」操作をそのURLへのリンクとして表示する", () => {
    render(<SchoolCard school={makeSchool({ url: "https://example-elementary.tokyo.jp" })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("button", { name: /詳細を見る/ });
    expect(link.getAttribute("href")).toBe("https://example-elementary.tokyo.jp");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("school.url が未設定の場合、「詳細を見る」操作を表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    expect(screen.queryByRole("button", { name: /詳細を見る/ })).toBeNull();
  });
});

describe("SchoolCard: 電話番号への発信リンク(電話する)", () => {
  it("school.phone が設定されている場合、「電話する」操作を tel: リンク(ハイフン除去)として表示する", () => {
    render(<SchoolCard school={makeSchool({ phone: "03-0000-0000" })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("button", { name: /電話する/ });
    expect(link.getAttribute("href")).toBe("tel:0300000000");
  });

  it("school.phone が未設定の場合、「電話する」操作を表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    expect(screen.queryByRole("button", { name: /電話する/ })).toBeNull();
  });
});

describe("SchoolCard: 住所のテキスト表示", () => {
  it("school.address が設定されている場合、住所をテキストとして表示する", () => {
    render(<SchoolCard school={makeSchool({ address: "東京都台東区上野1-1-1" })} schools={[]} municipality="台東区" />);

    expect(screen.getByText("東京都台東区上野1-1-1")).toBeTruthy();
  });

  it("school.address が未設定の場合、住所テキストを表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    expect(screen.queryByText("東京都台東区上野1-1-1")).toBeNull();
  });
});

describe("SchoolCard: 電話番号のテキスト表示(「電話する」ボタンとは別に表示される)", () => {
  it("school.phone が設定されている場合、電話番号そのものをテキストとして表示する", () => {
    render(<SchoolCard school={makeSchool({ phone: "03-0000-0000" })} schools={[]} municipality="台東区" />);

    expect(screen.getByText("03-0000-0000")).toBeTruthy();
  });

  it("school.phone が未設定の場合、電話番号テキストを表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    expect(screen.queryByText("03-0000-0000")).toBeNull();
  });
});

describe("SchoolCard: 地図で探す操作", () => {
  it("常にGoogleマップの検索結果へのリンクをボタンとして表示する", () => {
    render(<SchoolCard school={makeSchool({ address: "東京都台東区上野1-1-1" })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("東京都台東区上野1-1-1")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("lat/lngがある場合は住所テキストではなく座標をクエリに使う", () => {
    render(<SchoolCard school={makeSchool({ address: "東京都台東区上野1-1-1", lat: 35.7, lng: 139.77 })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=35.7%2C139.77");
  });
});

describe("SchoolCard: 補助操作フッター(出典・更新/質問する/訂正・更新、school.id がある場合)", () => {
  it("id がある場合、3つの補助操作(出典・更新ボタン+訂正・更新/質問するリンク)を grid-cols-3 で表示する", () => {
    render(<SchoolCard school={makeSchool({ id: "school-1" })} schools={[]} municipality="台東区" />);

    const group = screen.getByRole("group", { name: "上野小学校の補助操作" });
    expect(group.className).toContain("grid-cols-3");
    expect(screen.getByRole("button", { name: "出典・更新" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "上野小学校の掲載情報について質問する" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "上野小学校の掲載情報の訂正・更新を報告" })).toBeTruthy();
  });

  it("補助操作は「出典・更新」→「訂正・更新」→「質問する」の順でDOMに並ぶ", () => {
    render(<SchoolCard school={makeSchool({ id: "school-1" })} schools={[]} municipality="台東区" />);

    const group = screen.getByRole("group", { name: "上野小学校の補助操作" });
    const children = Array.from(group.children);
    expect(children).toHaveLength(3);
    expect(children[0].tagName).toBe("BUTTON");
    expect(children[0].textContent).toContain("出典・更新");
    expect(children[1].getAttribute("aria-label")).toBe("上野小学校の掲載情報の訂正・更新を報告");
    expect(children[2].getAttribute("aria-label")).toBe("上野小学校の掲載情報について質問する");
  });

  it("「出典・更新」を押すと学校自体+固定級のsourcesを重複排除して表示する", () => {
    render(
      <SchoolCard
        school={makeSchool({
          id: "school-1",
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
          fixedClasses: [
            { disabilityType: "intellectual", status: "confirmed", sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }] },
            { disabilityType: "autism_emotional", status: "confirmed", sources: [{ label: "教育委員会資料", confirmedOn: "2026-06-01" }] },
          ],
        })}
        schools={[]}
        municipality="台東区"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "出典・更新" }));

    // 代表出典1件(dedupedSources[0])は常時表示されるため、全出典の重複排除は
    // 展開パネル内の一覧(list)に絞って検証する。
    const sourceList = within(screen.getByRole("list"));
    expect(sourceList.getAllByText("台東区公式サイト")).toHaveLength(1);
    expect(sourceList.getByText("教育委員会資料", { exact: false })).toBeTruthy();
  });

  it("「質問する」は専用ページ(/support/ask)へのリンクとして、schoolターゲットのクエリを含む", () => {
    render(<SchoolCard school={makeSchool({ id: "school-1" })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("link", { name: "上野小学校の掲載情報について質問する" });
    expect(link.getAttribute("href")).toBe(
      `/support/ask?targetType=school&targetId=${encodeURIComponent("school-1")}`,
    );
  });

  it("訂正・更新リンクは専用ページ(/support/content-report)への遷移で targetType=school・targetId を含む(P0対応: 検索条件を back クエリへ埋め込まない)", () => {
    render(<SchoolCard school={makeSchool({ id: "school-1" })} schools={[]} municipality="台東区" />);

    const link = screen.getByRole("link", { name: "上野小学校の掲載情報の訂正・更新を報告" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe(`/support/content-report?targetType=school&targetId=${encodeURIComponent("school-1")}`);
    expect(href).not.toContain("back=");
  });
});

describe("SchoolCard: 代表出典の常時表示", () => {
  it("dedupedSources[0](学校自体+固定級のsourcesを重複排除した先頭1件)を、展開操作なしで初期レンダリング時から表示する", () => {
    render(
      <SchoolCard
        school={makeSchool({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
        })}
        schools={[]}
        municipality="台東区"
      />,
    );

    const link = screen.getByText("台東区公式サイト").closest("a");
    expect(link?.getAttribute("href")).toBe("https://example.taito.tokyo.jp");
    expect(screen.getByText(/確認日: 2026-07-01/)).toBeTruthy();
  });

  it("「出典: 」の接頭辞を付ける(自治体の二次利用許諾条件対応、常時表示のため出典であることを明示する)", () => {
    render(
      <SchoolCard
        school={makeSchool({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
        })}
        schools={[]}
        municipality="台東区"
      />,
    );

    expect(screen.getByText(/^出典:/)).toBeTruthy();
  });

  it("url が無い出典の場合はリンクにせずラベルのみをテキストとして表示する", () => {
    render(
      <SchoolCard
        school={makeSchool({ sources: [{ label: "教育委員会資料", confirmedOn: "2026-06-01" }] })}
        schools={[]}
        municipality="台東区"
      />,
    );

    expect(screen.getByText("教育委員会資料", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "教育委員会資料" })).toBeNull();
  });

  it("dedupedSources.length > 1 の場合、「ほか{n}件」を代表出典に併記する", () => {
    render(
      <SchoolCard
        school={makeSchool({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
          fixedClasses: [
            { disabilityType: "intellectual", status: "confirmed", sources: [{ label: "教育委員会資料", confirmedOn: "2026-06-01" }] },
            { disabilityType: "autism_emotional", status: "confirmed", sources: [{ label: "学校公表資料", confirmedOn: "2026-05-01" }] },
          ],
        })}
        schools={[]}
        municipality="台東区"
      />,
    );

    expect(screen.getByText(/ほか2件/)).toBeTruthy();
  });

  it("出典が1件のみ(重複排除後)の場合、「ほか」は表示しない", () => {
    render(
      <SchoolCard
        school={makeSchool({
          sources: [{ label: "台東区公式サイト", url: "https://example.taito.tokyo.jp", confirmedOn: "2026-07-01" }],
        })}
        schools={[]}
        municipality="台東区"
      />,
    );

    expect(screen.queryByText(/ほか/)).toBeNull();
  });

  it("学校・固定級のどちらにも sources が無い場合、代表出典の行自体を表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    expect(screen.queryByText(/確認日:/)).toBeNull();
    expect(screen.queryByText(/ほか/)).toBeNull();
  });
});

describe("SchoolCard: 補助操作フッター(school.id が無い場合の縮退表示)", () => {
  it("出典・更新のみを grid-cols-1 で表示し、質問する・訂正・更新は表示しない", () => {
    render(<SchoolCard school={makeSchool()} schools={[]} municipality="台東区" />);

    const group = screen.getByRole("group", { name: "上野小学校の補助操作" });
    expect(group.className).toContain("grid-cols-1");
    expect(screen.getByRole("button", { name: "出典・更新" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "質問する" })).toBeNull();
    expect(screen.queryByRole("link", { name: /掲載情報の訂正・更新を報告/ })).toBeNull();
  });
});
