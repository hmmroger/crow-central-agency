import { useCallback } from "react";
import { RefreshCw } from "lucide-react";
import type { ConnectorInfo } from "@crow-central-agency/shared";
import {
  useConnectorsQuery,
  useDisconnectConnector,
  useConnectConnector,
} from "../../hooks/queries/use-connectors-query.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { FieldGroup } from "./field-group.js";

interface ConnectorsSectionProps {
  /** Undefined while creating a new agent */
  agentId: string | undefined;
}

/**
 * Connectors section within the agent editor dialog.
 */
export function ConnectorsSection({ agentId }: ConnectorsSectionProps) {
  if (!agentId) {
    return (
      <FieldGroup label="Connectors">
        <p className="text-xs text-text-muted">Save the agent to configure connectors.</p>
      </FieldGroup>
    );
  }

  return <ConnectorsSectionBody agentId={agentId} />;
}

function ConnectorsSectionBody({ agentId }: { agentId: string }) {
  const { data: connectors = [], isLoading, error, refetch } = useConnectorsQuery(agentId);
  const connectConnector = useConnectConnector();
  const disconnectConnector = useDisconnectConnector();
  const confirm = useConfirmDialog();

  const handleConnect = useCallback(
    (id: string) => {
      connectConnector.mutate(
        { agentId, id },
        {
          onSuccess: ({ authUrl }) => {
            window.location.href = authUrl;
          },
        }
      );
    },
    [agentId, connectConnector]
  );

  const handleDisconnect = useCallback(
    (id: string, label: string) => {
      confirm({
        title: "Disconnect connector",
        message: `Disconnect ${label}? This clears the stored credentials. You'll need to authorize again to reconnect.`,
        confirmLabel: "Disconnect",
        destructive: true,
        onConfirm: () => {
          disconnectConnector.mutate({ agentId, id });
        },
      });
    },
    [agentId, disconnectConnector, confirm]
  );

  // Disconnect's error wins over Connect's so a stale connect failure
  // doesn't shadow a more recent disconnect failure.
  const mutationError = disconnectConnector.error ?? connectConnector.error;

  return (
    <FieldGroup label="Connectors">
      {isLoading && <p className="text-xs text-text-muted">Loading connectors...</p>}

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-error/10 border border-error/20 text-error text-xs">
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && connectors.length === 0 && (
        <p className="text-xs text-text-muted">No connectors registered.</p>
      )}

      {connectors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {connectors.map((connector) => (
            <ConnectorRow
              key={connector.id}
              connector={connector}
              isConnecting={connectConnector.isPending && connectConnector.variables?.id === connector.id}
              isDisconnecting={disconnectConnector.isPending && disconnectConnector.variables?.id === connector.id}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      {mutationError && <p className="mt-2 text-xs text-error">{mutationError.message}</p>}
    </FieldGroup>
  );
}

interface ConnectorRowProps {
  connector: ConnectorInfo;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: (id: string) => void;
  onDisconnect: (id: string, label: string) => void;
}

function ConnectorRow({ connector, isConnecting, isDisconnecting, onConnect, onDisconnect }: ConnectorRowProps) {
  const handleConnectClick = useCallback(() => {
    onConnect(connector.id);
  }, [onConnect, connector.id]);

  const handleDisconnectClick = useCallback(() => {
    onDisconnect(connector.id, connector.label);
  }, [onDisconnect, connector.id, connector.label]);

  const status = describeStatus(connector);
  const needsReconnect = connector.connection?.needsReconnect ?? false;
  const isBusy = isConnecting || isDisconnecting;

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border-subtle/60 bg-surface">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-base">{connector.label}</p>
        <p className="text-xs text-text-muted truncate">{status}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {connector.connection && needsReconnect && (
          <ActionButton
            label={isConnecting ? "Reconnecting..." : "Reconnect"}
            variant={ACTION_BUTTON_VARIANT.SECONDARY}
            disabled={isBusy}
            onClick={handleConnectClick}
          />
        )}
        {connector.connection ? (
          <ActionButton
            label={isDisconnecting ? "Disconnecting..." : "Disconnect"}
            variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
            disabled={isBusy}
            onClick={handleDisconnectClick}
          />
        ) : connector.configured ? (
          <ActionButton
            label={isConnecting ? "Connecting..." : "Connect"}
            variant={ACTION_BUTTON_VARIANT.PRIMARY}
            disabled={isBusy}
            onClick={handleConnectClick}
            className="px-1.5 py-1"
          />
        ) : null}
      </div>
    </div>
  );
}

function describeStatus(connector: ConnectorInfo): string {
  if (connector.connection) {
    if (connector.connection.needsReconnect) {
      return `Connected as ${connector.connection.profileUsername} - reconnect to enable new features`;
    }

    return `Connected as ${connector.connection.profileUsername}`;
  }

  if (!connector.configured) {
    return "Not configured (missing client credentials in .env)";
  }

  return "Not connected";
}
