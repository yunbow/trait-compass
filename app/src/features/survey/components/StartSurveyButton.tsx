"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { resetSurveyProgressStore } from "@/features/survey/hooks/useSurveyProgress";

/**
 * トップ画面の「はじめる」専用導線。保存済みの途中経過があっても、必ず最初の設問から始める。
 * 再開したい場合は ResumeBanner の「前回の続きから」を使う。
 */
export function StartSurveyButton() {
  return (
    <Button
      render={<Link href="/survey" />}
      nativeButton={false}
      size="lg"
      className="w-full max-w-xs self-center"
      onClick={resetSurveyProgressStore}
    >
      日常の困りごとチェックをはじめる
    </Button>
  );
}
