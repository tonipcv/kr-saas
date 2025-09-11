const BASE_URL = process.env.XASE_API_URL || 'https://app.xase.ai';
const LIST_INSTANCES_PATH = process.env.XASE_LIST_INSTANCES_PATH || '/api/external/instances';
const SEND_MESSAGE_PATH = process.env.XASE_SEND_MESSAGE_PATH || '/api/external/instances/:instanceId/messages';

type ListInstancesResponse = {
  instances?: Array<{
    id: string;
    status: string; // CONNECTED | DISCONNECTED | PENDING
    // Xase fields observed via cURL
    connectedNumber?: string;
    lastConnectedAt?: string;
    // Back-compat (if API ever returns these)
    phone?: string;
    lastSeenAt?: string;
  }>;
};

export async function listInstances(apiKey: string): Promise<ListInstancesResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${LIST_INSTANCES_PATH}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
  } catch (e: any) {
    throw new Error(`Failed to reach Xase at ${BASE_URL}. ${e?.message || 'Network error'}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Xase listInstances failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function sendMessage(apiKey: string, args: { instanceId: string; number: string; message: string }) {
  let res: Response;
  try {
    const path = `${BASE_URL}${SEND_MESSAGE_PATH.replace(':instanceId', encodeURIComponent(args.instanceId))}`;
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: args.number, message: args.message }),
    });
  } catch (e: any) {
    throw new Error(`Failed to reach Xase at ${BASE_URL}. ${e?.message || 'Network error'}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Xase sendMessage failed: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}
