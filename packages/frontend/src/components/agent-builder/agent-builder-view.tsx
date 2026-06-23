import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer, Loader2, RotateCcw } from "lucide-react";
import { AGENT_STATUS, CROW_WORLD_BUILDER_AGENT_ID, type AgentBuilderBuildResult } from "@crow-central-agency/shared";
import { useQueryClient } from "@tanstack/react-query";
import { HeaderPortal } from "../layout/header-portal.js";
import { useAgentBuilderDraftQuery } from "../../hooks/queries/use-agent-builder-draft-query.js";
import { useAgentStateQuery } from "../../hooks/queries/use-agent-state-query.js";
import { useDesignFleet, useResetDraft, useBuildFleet } from "../../hooks/queries/use-agent-builder-mutations.js";
import { agentBuilderKeys } from "../../services/query-keys.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { ConfirmationDialog } from "../common/dialogs/confirmation-dialog.js";
import { ActionButton, ACTION_BUTTON_VARIANT } from "../common/action-button.js";
import { FleetConfigBar } from "./fleet-config-bar.js";
import { FleetBoard } from "./fleet-board.js";
import { FleetComposer } from "./fleet-composer.js";
import { BuildResultNotice } from "./build-result-notice.js";

/**
 * Agent Builder view — design or refine a fleet of agents from a requirement and render the resulting
 * board. The board reflects GET /draft (backend is the source of truth); design/refine mode is derived
 * from whether that draft already has agents, not from local state.
 */
export function AgentBuilderView() {
  const draftQuery = useAgentBuilderDraftQuery();
  const worldBuilderState = useAgentStateQuery(CROW_WORLD_BUILDER_AGENT_ID);
  const { mutateAsync: designFleet, isPending: isDesigningMutation, error: designError } = useDesignFleet();
  const { mutateAsync: resetDraft } = useResetDraft();
  const { mutateAsync: buildFleet, isPending: isBuilding } = useBuildFleet();
  const { showDialog } = useModalDialog();
  const queryClient = useQueryClient();

  const [buildResult, setBuildResult] = useState<AgentBuilderBuildResult | undefined>(undefined);

  const draft = draftQuery.data;
  const agents = draft?.agents ?? [];
  const agentCount = agents.length;
  const hasAgents = agentCount > 0;
  const projectPath = draft?.projectPath;

  const worldBuilderStatus = worldBuilderState.data?.status ?? AGENT_STATUS.IDLE;
  const isDesigning = isDesigningMutation || worldBuilderStatus !== AGENT_STATUS.IDLE;

  const prevStatusRef = useRef(worldBuilderStatus);
  useEffect(() => {
    if (prevStatusRef.current !== AGENT_STATUS.IDLE && worldBuilderStatus === AGENT_STATUS.IDLE) {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
    }

    prevStatusRef.current = worldBuilderStatus;
  }, [worldBuilderStatus, queryClient]);

  const errorsByName = useMemo(
    () => new Map(buildResult?.failed.map((item): [string, string] => [item.name, item.error]) ?? []),
    [buildResult]
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      setBuildResult(undefined);
      await designFleet({ input });
    },
    [designFleet]
  );

  const handleDismissBuildResult = useCallback(() => setBuildResult(undefined), []);

  const handleReset = useCallback(() => {
    showDialog({
      id: "agent-builder-reset",
      component: ConfirmationDialog,
      componentProps: {
        message: "Discard the current draft fleet? This clears all designed agents.",
        confirmLabel: "Discard",
        destructive: true,
        onConfirm: () => {
          setBuildResult(undefined);
          return resetDraft();
        },
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
        message: `Create ${agentCount} agent${agentCount === 1 ? "" : "s"} ${
          projectPath ? `in ${projectPath}` : "without a workspace"
        }?`,
        confirmLabel: "Build",
        pendingLabel: "Building...",
        onConfirm: async () => {
          const result = await buildFleet();
          setBuildResult(result);
        },
      },
      title: "Build Fleet",
      className: "w-80",
    });
  }, [isBuilding, showDialog, buildFleet, agentCount, projectPath]);

  const busyLabel = isBuilding ? "Building fleet..." : hasAgents ? "Refining fleet..." : "Designing fleet...";

  const composer = (
    <FleetComposer
      hasAgents={hasAgents}
      isPending={isDesigning || isBuilding}
      error={designError?.message}
      onSubmit={handleSubmit}
    />
  );
  const configBar = <FleetConfigBar seedProjectPath={draft?.projectPath} seedAgentType={draft?.agentType} />;

  return (
    <div className="flex h-full flex-col">
      <HeaderPortal title="Agent Builder" />

      {draftQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
        </div>
      ) : hasAgents ? (
        <>
          <div className="shrink-0 border-b border-border-subtle px-4 py-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              {composer}
              {configBar}
            </div>
          </div>

          {buildResult && <BuildResultNotice result={buildResult} onDismiss={handleDismissBuildResult} />}

          <FleetBoard
            agents={agents}
            isBusy={isDesigning || isBuilding}
            busyLabel={busyLabel}
            errorsByName={errorsByName}
          />

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-6 py-3">
            <span className="text-xs text-text-muted">
              {agentCount} agent{agentCount === 1 ? "" : "s"} designed
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
                disabled={isBuilding}
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
