// scripts/data/fetch-open-data.mjs の純関数部分のテスト。
//
// このスクリプトは data/open-data/sources.yaml の原本データをネットワーク経由で取得する
// CLI だが、main() は直接実行されたときのみ起動するようガードされている(import 時の副作用
// なし)ため、export された純関数(ネットワーク・ファイルI/Oに依存しない部分)を通常の
// ESM import でテストできる。fetch/ダウンロード自体はここではテストしない。
import { describe, expect, it } from "vitest";

import {
  computeSha256,
  diffAgainstPreviousMeta,
  resolveFilename,
} from "../fetch-open-data.mjs";

describe("computeSha256", () => {
  it("同一内容のバッファからは常に同じハッシュを生成する(再取得時の差分検知のため)", () => {
    const buffer = Buffer.from("hello world", "utf8");
    expect(computeSha256(buffer)).toBe(computeSha256(Buffer.from("hello world", "utf8")));
  });

  it("内容が1バイトでも異なれば異なるハッシュになる", () => {
    const first = computeSha256(Buffer.from("hello world", "utf8"));
    const second = computeSha256(Buffer.from("hello worle", "utf8"));
    expect(first).not.toBe(second);
  });

  it("SHA-256のため16進数64文字を返す", () => {
    const hash = computeSha256(Buffer.from("test", "utf8"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("resolveFilename", () => {
  it("manifestにfilenameが指定されている場合はそれを優先する", () => {
    expect(
      resolveFilename({ url: "https://example.com/data/original.csv", filename: "renamed.csv" }),
    ).toBe("renamed.csv");
  });

  it("filenameが未指定の場合、URLのパス末尾からファイル名を決める", () => {
    expect(resolveFilename({ url: "https://example.com/data/original.csv" })).toBe("original.csv");
  });

  it("URLエンコードされたファイル名はデコードして使う", () => {
    expect(
      resolveFilename({ url: "https://example.com/data/%E6%9D%B1%E4%BA%AC.csv" }),
    ).toBe("東京.csv");
  });

  it("URLのパスにファイル名部分がない場合は既定値'download'を使う", () => {
    expect(resolveFilename({ url: "https://example.com/" })).toBe("download");
  });
});

describe("diffAgainstPreviousMeta", () => {
  const previousMeta = {
    files: [
      { filename: "a.csv", sha256: "hash-a-old" },
      { filename: "b.csv", sha256: "hash-b" },
    ],
  };

  it("前回のfetch-meta.jsonが無い場合(初回取得)、全ファイルがaddedになる", () => {
    const result = diffAgainstPreviousMeta(null, [{ filename: "a.csv", sha256: "hash-a" }]);
    expect(result).toEqual([{ filename: "a.csv", sha256: "hash-a", status: "added" }]);
  });

  it("前回に無かったファイルはaddedになる", () => {
    const result = diffAgainstPreviousMeta(previousMeta, [{ filename: "c.csv", sha256: "hash-c" }]);
    expect(result[0].status).toBe("added");
  });

  it("前回と同一ハッシュのファイルはunchangedになる", () => {
    const result = diffAgainstPreviousMeta(previousMeta, [{ filename: "b.csv", sha256: "hash-b" }]);
    expect(result[0].status).toBe("unchanged");
  });

  it("前回と異なるハッシュのファイルはchangedになる", () => {
    const result = diffAgainstPreviousMeta(previousMeta, [{ filename: "a.csv", sha256: "hash-a-new" }]);
    expect(result[0].status).toBe("changed");
  });

  it("複数ファイルを一度に判定し、元のfileオブジェクトのプロパティは保持する", () => {
    const result = diffAgainstPreviousMeta(previousMeta, [
      { filename: "a.csv", sha256: "hash-a-new", bytes: 100, url: "https://example.com/a.csv" },
      { filename: "b.csv", sha256: "hash-b", bytes: 200, url: "https://example.com/b.csv" },
      { filename: "c.csv", sha256: "hash-c", bytes: 300, url: "https://example.com/c.csv" },
    ]);
    expect(result).toEqual([
      { filename: "a.csv", sha256: "hash-a-new", bytes: 100, url: "https://example.com/a.csv", status: "changed" },
      { filename: "b.csv", sha256: "hash-b", bytes: 200, url: "https://example.com/b.csv", status: "unchanged" },
      { filename: "c.csv", sha256: "hash-c", bytes: 300, url: "https://example.com/c.csv", status: "added" },
    ]);
  });

  it("previousMeta.filesが空配列/未定義でも全件addedとして扱う", () => {
    const result = diffAgainstPreviousMeta({ files: [] }, [{ filename: "a.csv", sha256: "hash-a" }]);
    expect(result[0].status).toBe("added");
    const resultUndefinedFiles = diffAgainstPreviousMeta({}, [{ filename: "a.csv", sha256: "hash-a" }]);
    expect(resultUndefinedFiles[0].status).toBe("added");
  });
});
