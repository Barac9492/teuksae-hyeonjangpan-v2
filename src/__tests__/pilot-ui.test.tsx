import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "../features/header/Header";
import { MomentsPanel } from "../features/moments/MomentsPanel";

const status = { phase: "connected" as const, queuedMutations: 0 };

describe("pilot approval and example-media UI", () => {
  it("labels all unapproved headers as unofficial rehearsals", () => {
    render(
      <Header
        appName="특새 현장판"
        churchName="테스트 교회"
        activeView="today"
        online
        official={false}
        status={status}
        onChangeView={vi.fn()}
      />,
    );
    expect(
      screen.getByText("테스트 교회 비공식 운영 리허설"),
    ).toBeInTheDocument();
  });

  it("shows four clearly labeled example scenes only in local mode", () => {
    render(
      <MomentsPanel
        repositoryMode="local"
        connected={false}
        onDraftCreated={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("로컬 리허설 예시 장면")).toBeInTheDocument();
    expect(screen.getAllByText("예시")).toHaveLength(4);
  });

  it("never shows fake scene cards in remote mode", () => {
    render(
      <MomentsPanel
        repositoryMode="remote"
        connected
        onDraftCreated={vi.fn()}
        onUpload={vi.fn()}
        onToast={vi.fn()}
      />,
    );
    expect(
      screen.queryByLabelText("로컬 리허설 예시 장면"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("송림 본당 앞 · 문 열림 안내 예시"),
    ).not.toBeInTheDocument();
  });
});
