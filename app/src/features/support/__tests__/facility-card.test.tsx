import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FacilityCard } from "@/features/support/components/FacilityCard";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

function makeFacility(overrides: Partial<FacilityDisplayData> = {}): FacilityDisplayData {
  return {
    id: "fac-001",
    name: "ダミー相談窓口",
    municipality: "世田谷区",
    categoryType: "相談窓口",
    mode: "full",
    address: "東京都世田谷区XX",
    phone: "03-0000-0000",
    summary: "説明文",
    url: "https://example.com",
    matchesTags: true,
    facilitySubtype: null,
    sourceCredit: "出典: ダミーデータセット",
    sourceUrl: null,
    lat: null,
    lng: null,
    datasetId: "ds-a",
    datasetTitle: "ダミーデータセット",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    frozen: false,
    noDiagnosisOk: false,
    contactMethods: null,
    isPathwayFacility: false,
    ...overrides,
  };
}

describe("FacilityCard: noDiagnosisOk バッジ(TICKET-0050)", () => {
  it("noDiagnosisOk=true の場合、非断定表現のバッジ文言を表示する(AC-3, AC-5)", () => {
    render(<FacilityCard facility={makeFacility({ noDiagnosisOk: true })} />);

    expect(
      screen.getByText("診断がなくても相談できるとされています。個別の相談可否は窓口へご確認ください。"),
    ).toBeTruthy();
  });

  it("noDiagnosisOk=false の場合、バッジを表示しない", () => {
    render(<FacilityCard facility={makeFacility({ noDiagnosisOk: false })} />);

    expect(
      screen.queryByText("診断がなくても相談できるとされています。個別の相談可否は窓口へご確認ください。"),
    ).toBeNull();
  });

  it("mode=summary(中〜高リスク)でも noDiagnosisOk バッジは表示される(AC-4: リスク区分の出し分け対象外)", () => {
    render(<FacilityCard facility={makeFacility({ mode: "summary", address: null, phone: null, noDiagnosisOk: true })} />);

    expect(
      screen.getByText("診断がなくても相談できるとされています。個別の相談可否は窓口へご確認ください。"),
    ).toBeTruthy();
  });
});

describe("FacilityCard: 電話以外の連絡手段(TICKET-0051)", () => {
  it("contactMethods がある場合、折りたたみで表示する(AC-3)", () => {
    render(<FacilityCard facility={makeFacility({ contactMethods: "メール可・フォーム可" })} />);

    expect(screen.getByText("電話以外の連絡手段").closest("summary")).toBeTruthy();
    expect(screen.getByText("メール可・フォーム可")).toBeTruthy();
  });

  it("contactMethods が null の場合は何も表示しない(「連絡手段なし」と誤読させない、AC-4)", () => {
    render(<FacilityCard facility={makeFacility({ contactMethods: null })} />);

    expect(screen.queryByText(/電話以外の連絡手段/)).toBeNull();
  });
});

describe("FacilityCard: 相談先を判断するための情報階層", () => {
  it("選択した相談分野に関連する窓口であることを、タグ一致時だけ表示する", () => {
    const { rerender } = render(<FacilityCard facility={makeFacility({ matchesTags: true })} />);

    expect(screen.getByText("相談分野に関連")).toBeTruthy();

    rerender(<FacilityCard facility={makeFacility({ matchesTags: false })} />);
    expect(screen.queryByText("相談分野に関連")).toBeNull();
  });

  it("選択地域外の窓口には広域であることを表示する", () => {
    render(<FacilityCard facility={makeFacility({ municipality: "東京都" })} selectedMunicipality="世田谷区" />);

    expect(screen.getByText("広域の窓口")).toBeTruthy();
    expect(screen.getByText("選択地域外の広域窓口です。")).toBeTruthy();
  });

  it("電話番号がある場合は電話する操作を tel: リンクとして表示する", () => {
    render(<FacilityCard facility={makeFacility({ phone: "03-0000-0000" })} />);

    expect(screen.getByRole("button", { name: "電話する" }).getAttribute("href")).toBe("tel:0300000000");
    expect(screen.getByText("03-0000-0000")).toBeTruthy();
  });

  it("summary モードでは住所・電話・連絡手段を出さず、安全な要約と公式サイト導線だけを出す", () => {
    render(<FacilityCard facility={makeFacility({ mode: "summary", address: null, phone: null, contactMethods: null, summary: "要約だけを表示" })} />);

    expect(screen.getByText("要約だけを表示")).toBeTruthy();
    expect(screen.queryByText("東京都世田谷区XX")).toBeNull();
    expect(screen.queryByRole("button", { name: "電話する" })).toBeNull();
    expect(screen.queryByText(/電話以外の連絡手段/)).toBeNull();
    expect(screen.getByRole("button", { name: "公式サイトで確認する" })).toBeTruthy();
  });

  it("「質問する」は専用ページ(/support/ask)へのリンクとして、クリックせずとも存在する", () => {
    render(<FacilityCard facility={makeFacility()} />);

    const link = screen.getByRole("link", { name: "ダミー相談窓口の掲載情報について質問する" });
    expect(link.getAttribute("href")).toBe(
      `/support/ask?targetType=facility&targetId=${encodeURIComponent("fac-001")}`,
    );
  });
});

describe("FacilityCard: 施設サブタイプのバッジ", () => {
  it("facilitySubtype がある場合、その文言をバッジとして表示する", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: "保健施設" })} />);

    expect(screen.getByText("保健施設")).toBeTruthy();
  });

  it("facilitySubtype が null の場合はバッジを表示しない", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: null })} />);

    expect(screen.queryByText("保健施設")).toBeNull();
  });

  it("相談分野に関連・広域の窓口バッジより先頭に表示する", () => {
    const { container } = render(
      <FacilityCard
        facility={makeFacility({ facilitySubtype: "保健施設", matchesTags: true, municipality: "東京都" })}
        selectedMunicipality="世田谷区"
      />,
    );

    const badgeTexts = Array.from(container.querySelectorAll("span")).map((span) => span.textContent);
    expect(badgeTexts.slice(0, 3)).toEqual(["保健施設", "相談分野に関連", "広域の窓口"]);
  });
});

describe("FacilityCard: 施設サブタイプの補足説明(キュレーション済み対応表)", () => {
  it("キュレーション済み対応表にある値(例: 保健施設)の場合、施設名の直後に補足説明を表示する", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: "保健施設" })} />);

    const heading = screen.getByText("ダミー相談窓口");
    const description = screen.getByText("保健師などに健康・発達の相談ができる施設です。");
    expect(description).toBeTruthy();
    expect(heading.nextElementSibling).toBe(description);
  });

  it("対応表に無い任意の文字列の場合、補足説明は表示しない(バッジ自体は生の値のまま表示される)", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: "架空の分類" })} />);

    expect(screen.getByText("架空の分類")).toBeTruthy();
    expect(screen.queryByText("保健師などに健康・発達の相談ができる施設です。")).toBeNull();
  });

  it("facilitySubtype が null の場合、補足説明は表示しない", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: null })} />);

    expect(screen.queryByText("保健師などに健康・発達の相談ができる施設です。")).toBeNull();
  });
});

describe("FacilityCard: 施設サブタイプバッジのクリック絞り込み", () => {
  it("onSubtypeClick がある場合、バッジはボタンとして表示され、クリックで facilitySubtype を引数に呼び出す", () => {
    const onSubtypeClick = vi.fn();
    render(
      <FacilityCard
        facility={makeFacility({ facilitySubtype: "保健施設" })}
        onSubtypeClick={onSubtypeClick}
      />,
    );

    const button = screen.getByRole("button", { name: "保健施設" });
    fireEvent.click(button);

    expect(onSubtypeClick).toHaveBeenCalledWith("保健施設");
  });

  it("onSubtypeClick がある場合、subtypeActive の値が aria-pressed に反映される", () => {
    const { rerender } = render(
      <FacilityCard
        facility={makeFacility({ facilitySubtype: "保健施設" })}
        onSubtypeClick={vi.fn()}
        subtypeActive={false}
      />,
    );

    expect(screen.getByRole("button", { name: "保健施設" }).getAttribute("aria-pressed")).toBe("false");

    rerender(
      <FacilityCard
        facility={makeFacility({ facilitySubtype: "保健施設" })}
        onSubtypeClick={vi.fn()}
        subtypeActive={true}
      />,
    );

    expect(screen.getByRole("button", { name: "保健施設" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("onSubtypeClick が無い場合(地図ポップアップ等)は、従来どおり非対話的な span のまま表示する", () => {
    render(<FacilityCard facility={makeFacility({ facilitySubtype: "保健施設" })} />);

    expect(screen.getByText("保健施設")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保健施設" })).toBeNull();
  });
});

describe("FacilityCard: 地図で探す操作", () => {
  it("常にGoogleマップの検索結果へのリンクをボタンとして表示する", () => {
    render(<FacilityCard facility={makeFacility({ address: "東京都世田谷区XX" })} />);

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("東京都世田谷区XX")}`,
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("address が無い場合、市区町村名+施設名をクエリとして使う", () => {
    render(<FacilityCard facility={makeFacility({ address: null, municipality: "世田谷区", name: "ダミー相談窓口" })} />);

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("世田谷区ダミー相談窓口")}`,
    );
  });

  it("lat/lngがある場合は住所テキストではなく座標をクエリに使う(建物名を含む住所のジオコーディング失敗を避けるため)", () => {
    render(<FacilityCard facility={makeFacility({ address: "東京都台東区浅草３−９−２　ランドール浅草１０２", lat: 35.71705372, lng: 139.79449092 })} />);

    const link = screen.getByRole("button", { name: /地図で探す/ });
    expect(link.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=35.71705372%2C139.79449092",
    );
  });

  it("電話・URLがどちらも無い場合でも地図で探すボタンは表示される", () => {
    render(<FacilityCard facility={makeFacility({ phone: null, url: null })} />);

    expect(screen.getByRole("button", { name: "地図で探す" })).toBeTruthy();
  });

  it("電話するボタンは単独で全幅の行として表示され、詳細を見る/地図で探すとは別の行になる", () => {
    render(<FacilityCard facility={makeFacility({ phone: "03-0000-0000", url: "https://example.com" })} />);

    const phoneButton = screen.getByRole("button", { name: "電話する" });
    const urlButton = screen.getByRole("button", { name: "詳細を見る" });
    const mapButton = screen.getByRole("button", { name: "地図で探す" });

    expect(phoneButton.parentElement).not.toBe(urlButton.parentElement);
    expect(urlButton.parentElement).toBe(mapButton.parentElement);
  });
});

describe("FacilityCard: 地図で探すボタンの表示条件(categoryType)", () => {
  it("categoryType が「相談窓口」の場合、地図で探すボタンを表示する", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "相談窓口" })} />);

    expect(screen.getByRole("button", { name: "地図で探す" })).toBeTruthy();
  });

  it("categoryType が「福祉ガイド」の場合、地図で探すボタンを表示する", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "福祉ガイド" })} />);

    expect(screen.getByRole("button", { name: "地図で探す" })).toBeTruthy();
  });

  it("categoryType が「支援制度」の場合、地図で探すボタンを表示しない", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "支援制度" })} />);

    expect(screen.queryByRole("button", { name: "地図で探す" })).toBeNull();
  });

  it("categoryType が「発達障害支援資料」の場合、地図で探すボタンを表示しない", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "発達障害支援資料" })} />);

    expect(screen.queryByRole("button", { name: "地図で探す" })).toBeNull();
  });

  it("categoryType が「支援制度」で電話・URLも無い場合、ボタン行自体を表示しない(空のdivを残さない)", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "支援制度", phone: null, url: null })} />);

    expect(screen.queryByRole("button", { name: "電話する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "詳細を見る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "公式サイトで確認する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "地図で探す" })).toBeNull();
  });

  it("categoryType が「発達障害支援資料」で電話・URLも無い場合、ボタン行自体を表示しない(空のdivを残さない)", () => {
    render(<FacilityCard facility={makeFacility({ categoryType: "発達障害支援資料", phone: null, url: null })} />);

    expect(screen.queryByRole("button", { name: "電話する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "詳細を見る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "公式サイトで確認する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "地図で探す" })).toBeNull();
  });
});

describe("FacilityCard: 掲載情報の誤り報告リンク(TICKET-0064)", () => {
  it("専用ページ(/support/facility-report)へのリンクとして表示する(P0対応: 検索条件を back クエリへ埋め込まない)", () => {
    render(<FacilityCard facility={makeFacility()} />);

    const link = screen.getByRole("link", { name: "ダミー相談窓口の掲載情報の訂正・更新を報告" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toBe(`/support/facility-report?facilityId=${encodeURIComponent("fac-001")}`);
    expect(href).not.toContain("back=");
  });
});

describe("FacilityCard: 出典クレジットの常時表示(FR-026, NFR-54)", () => {
  it("展開操作なしで初期レンダリング時から出典クレジットを表示する", () => {
    render(<FacilityCard facility={makeFacility({ sourceCredit: "出典: ダミーデータセット(ダミー団体)、CC BY 4.0" })} />);

    expect(screen.getByText(/出典: ダミーデータセット/)).toBeTruthy();
  });

  it("sourceUrl がある場合、「データセットを見る」リンクも初期レンダリング時から表示する", () => {
    render(<FacilityCard facility={makeFacility({ sourceUrl: "https://example.com/dataset" })} />);

    const link = screen.getByText("データセットを見る").closest("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/dataset");
  });

  it("mode=summary(中〜高リスク)でも出典クレジットは表示される(住所・電話等とは異なる出し分け対象外の情報)", () => {
    render(<FacilityCard facility={makeFacility({ mode: "summary", address: null, phone: null })} />);

    expect(screen.getByText(/出典: ダミーデータセット/)).toBeTruthy();
  });

  it("補助操作は「質問する」「訂正・更新」の2つのみで、出典・更新ボタンは表示しない", () => {
    render(<FacilityCard facility={makeFacility()} />);

    const group = screen.getByRole("group", { name: "ダミー相談窓口の補助操作" });
    expect(group.className).toContain("grid-cols-2");
    expect(screen.queryByRole("button", { name: "出典・更新" })).toBeNull();
    expect(screen.getByRole("link", { name: "ダミー相談窓口の掲載情報について質問する" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "ダミー相談窓口の掲載情報の訂正・更新を報告" })).toBeTruthy();
  });

  it("補助操作は「訂正・更新」→「質問する」の順でDOMに並ぶ", () => {
    render(<FacilityCard facility={makeFacility()} />);

    const group = screen.getByRole("group", { name: "ダミー相談窓口の補助操作" });
    const links = within(group).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("aria-label")).toBe("ダミー相談窓口の掲載情報の訂正・更新を報告");
    expect(links[1].getAttribute("aria-label")).toBe("ダミー相談窓口の掲載情報について質問する");
  });
});

describe("FacilityCard: 比較対象の選択", () => {
  it("selectable のときだけ施設名を含むチェックボックスを表示する", () => {
    const onSelectedChange = vi.fn();
    render(<FacilityCard facility={makeFacility()} selectable onSelectedChange={onSelectedChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "ダミー相談窓口を比較対象に追加" }));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });

  it("selectable でなければチェックボックスを表示しない", () => {
    render(<FacilityCard facility={makeFacility()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
