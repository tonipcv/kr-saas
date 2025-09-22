export type CampaignJobInput = {
  doctorId: string;
  campaignId: string;
  channel: 'whatsapp' | 'sms' | 'email';
  status: 'scheduled' | 'running' | 'done' | 'failed' | 'cancelled';
  trigger?: string;
  scheduleAt?: string | Date;
  lastError?: string | null;
  id?: string;
};

/**
 * Client-safe logger for campaign jobs. Best-effort: it won't throw.
 */
export async function logCampaignJob(input: CampaignJobInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('/api/v2/doctor/broadcast/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        scheduleAt: input.scheduleAt ? new Date(input.scheduleAt) : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
    return { ok: true, id: json?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'failed to log job' };
  }
}
