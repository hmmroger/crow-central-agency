import { useCircleArtifactsQuery } from "../../../hooks/queries/use-circle-artifacts-query.js";
import { useModalDialog } from "../../../providers/modal-dialog-provider.js";
import { ArtifactPanel } from "../artifact/artifact-panel.js";
import { AddArtifactDialog } from "../artifact/add-artifact-dialog.js";

interface CircleArtifactsTabProps {
  agentId: string;
}

/** Circle Artifacts tab — artifacts visible to the agent through its circles. */
export function CircleArtifactsTab({ agentId }: CircleArtifactsTabProps) {
  const { data: artifacts = [], isLoading, isError, refetch } = useCircleArtifactsQuery(agentId);
  const { showDialog } = useModalDialog();

  const handleAdd = () => {
    showDialog({
      id: "add-circle-artifact",
      component: AddArtifactDialog,
      componentProps: { agentId, isCircle: true, onUploaded: () => void refetch() },
      title: "Add Circle Artifact",
      className: "w-fit",
    });
  };

  return (
    <ArtifactPanel
      artifacts={artifacts}
      loading={isLoading}
      isError={isError}
      onRefresh={() => void refetch()}
      onAdd={handleAdd}
      label="Circle Artifacts"
    />
  );
}
