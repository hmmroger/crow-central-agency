import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer, Loader2, RotateCcw } from "lucide-react";
import { AGENT_STATUS, AGENT_BUILDER_DRAFT_STATUS, CROW_WORLD_BUILDER_AGENT_ID } from "@crow-central-agency/shared";
import { HeaderPortal } from "../layout/header-portal.js";
import { useAgentBuilderContext } from "../../providers/agent-builder-provider.js";
import { useAgentState } from "../../hooks/use-agent-state.js";
import { useDesignFleet, useResetDraft, useBuildFleet } from "../../hooks/queries/use-agent-builder-mutations.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { ConfirmationDialog } from "../common/dialogs/confirmation-dialog.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { FleetConfigBar } from "./fleet-config-bar.js";
import { FleetBoard } from "./fleet-board.js";
import { FleetComposer } from "./fleet-composer.js";
import { BuildResultNotice } from "./build-result-notice.js";
import { AvailableAgentsNotice } from "./available-agents-notice.js";

export function AgentBuilderView() {
  const { draft, isLoading } = useAgentBuilderContext();
  const worldBuilderState = useAgentState(CROW_WORLD_BUILDER_AGENT_ID);
  const { mutateAsync: designFleet, isPending: isDesigningMutation, error: designError } = useDesignFleet();
  const { mutateAsync: resetDraft } = useResetDraft();
  const { mutateAsync: buildFleet } = useBuildFleet();
  const { showDialog } = useModalDialog();

  const [showResultNotice, setShowResultNotice] = useState(true);

  const agents = draft?.agents ?? [];
  const agentCount = agents.length;
  const hasAgents = agentCount > 0;
  const projectPath = draft?.projectPath;
  const status = draft?.status;
  const buildResult = draft?.lastBuildResult;
  const existingAgents = draft?.existingAgents ?? [];

  const worldBuilderStatus = worldBuilderState?.status ?? AGENT_STATUS.IDLE;
  const isDesigning = isDesigningMutation || worldBuilderStatus !== AGENT_STATUS.IDLE;
  const isBuilding = status === AGENT_BUILDER_DRAFT_STATUS.BUILDING;
  const isCompleted = status === AGENT_BUILDER_DRAFT_STATUS.COMPLETED;
  const isBusy = isDesigning || isBuilding;
  const builtCount = draft?.builtAgents?.length ?? 0;
  const hasContent = hasAgents || existingAgents.length > 0;

  const errorsByName = useMemo(
    () => new Map(buildResult?.failed.map((item): [string, string] => [item.name, item.error]) ?? []),
    [buildResult]
  );

  const builtNames = useMemo(
    () => new Set(draft?.builtAgents?.map((builtAgent) => builtAgent.name) ?? []),
    [draft?.builtAgents]
  );

  useEffect(() => {
    if (isBuilding) {
      setShowResultNotice(true);
    }
  }, [isBuilding]);

  const completionShownRef = useRef(false);
  useEffect(() => {
    if (!isCompleted) {
      completionShownRef.current = false;
      return;
    }

    if (completionShownRef.current) {
      return;
    }

    completionShownRef.current = true;

    const createdCount = buildResult?.created.length ?? agentCount;
    showDialog({
      id: "agent-builder-complete",
      component: ConfirmationDialog,
      componentProps: {
        message: `Fleet built — ${createdCount} agent${createdCount === 1 ? "" : "s"} created.`,
        confirmLabel: "OK",
        pendingLabel: "Finishing...",
        confirmOnly: true,
        onConfirm: () => resetDraft(),
      },
      title: "Build Complete",
      className: "w-80",
    });
  }, [isCompleted, buildResult, agentCount, showDialog, resetDraft]);

  const handleSubmit = useCallback(
    async (input: string) => {
      await designFleet({ input });
    },
    [designFleet]
  );

  const handleDismissResultNotice = useCallback(() => setShowResultNotice(false), []);

  const handleReset = useCallback(() => {
    showDialog({
      id: "agent-builder-reset",
      component: ConfirmationDialog,
      componentProps: {
        message: "Discard the current draft fleet? This clears all designed agents.",
        confirmLabel: "Discard",
        destructive: true,
        onConfirm: () => resetDraft(),
      },
      title: "Discard Fleet",
      className: "w-80",
      role: "alertdialog",
    });
  }, [showDialog, resetDraft]);

  const handleBuild = useCallback(() => {
    if (isBuilding) {
      return;
    }

    showDialog({
      id: "agent-builder-build",
      component: ConfirmationDialog,
      componentProps: {
        message: `Create ${agentCount} agent${agentCount === 1 ? "" : "s"} with ${
          projectPath ? `workspace ${projectPath}` : "the default workspace"
        }?`,
        confirmLabel: "Build",
        pendingLabel: "Starting...",
        onConfirm: () => buildFleet(),
      },
      title: "Build Fleet",
      className: "w-80",
    });
  }, [isBuilding, showDialog, buildFleet, agentCount, projectPath]);

  const busyLabel = hasContent ? "Refining fleet..." : "Designing fleet...";
  const showPartialFailureNotice = Boolean(
    showResultNotice && !isBuilding && buildResult && buildResult.failed.length > 0
  );

  const composer = (
    <FleetComposer hasAgents={hasContent} isPending={isBusy} error={designError?.message} onSubmit={handleSubmit} />
  );
  const configBar = <FleetConfigBar seedProjectPath={draft?.projectPath} seedAgentType={draft?.agentType} />;

  return (
    <div className="flex h-full flex-col">
      <HeaderPortal title="Agent Builder" />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : hasContent ? (
        <>
          <div className="shrink-0 border-b border-border-subtle px-4 py-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {composer}
              {configBar}
            </div>
          </div>

          {showPartialFailureNotice && buildResult && (
            <BuildResultNotice result={buildResult} onDismiss={handleDismissResultNotice} />
          )}

          <AvailableAgentsNotice agents={existingAgents} />

          <FleetBoard
            agents={agents}
            isBusy={isDesigning}
            busyLabel={busyLabel}
            errorsByName={errorsByName}
            builtNames={builtNames}
          />

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-6 py-3">
            <span className="text-xs text-text-muted">
              {isBuilding
                ? `Building… ${builtCount}/${agentCount}`
                : hasAgents
                  ? `${agentCount} agent${agentCount === 1 ? "" : "s"} designed`
                  : "Requirement already covered — refine or discard"}
            </span>
            <div className="flex items-center gap-2">
              <ActionButton
                label="Discard"
                icon={RotateCcw}
                variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
                onClick={handleReset}
              />
              <ActionButton
                label="Build all"
                icon={Hammer}
                variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
                onClick={handleBuild}
                disabled={!hasAgents || isBuilding || isCompleted}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-8">
          <div className="flex w-full max-w-3xl flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-text-base">Design your fleet</h2>
              <p className="mt-1 text-sm text-text-muted">
                Describe what you want to accomplish, and Crow designs a team of agents to do it.
              </p>
            </div>
            {composer}
            {configBar}
          </div>
        </div>
      )}
    </div>
  );
}
