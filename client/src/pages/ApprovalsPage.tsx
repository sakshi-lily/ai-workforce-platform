import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRouter } from '../router/Router';

interface ApprovalItem {
  id: string;
  task_id: string;
  step_id?: string | null;
  organization_id: string;
  requested_by?: string | null;
  approved_by?: string | null;
  tool_name: string;
  risk_level: string;
  action_type: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  payload_preview: Record<string, any>;
  request_payload: Record<string, any>;
  reviewer_notes?: string | null;
  decision_note?: string | null;
  requested_at: string;
  decided_at?: string | null;
  expires_at?: string | null;
  executed_at?: string | null;
  created_at: string;
}

export const ApprovalsPage: React.FC = () => {
  const { token } = useAuth();
  const { navigate } = useRouter();

  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED'>('ALL');
  const [activeModal, setActiveModal] = useState<ApprovalItem | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchApprovals = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const url = filter === 'ALL' 
        ? '/api/approvals' 
        : `/api/approvals?status=${filter}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setApprovals(data.data.approvals || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [token, filter]);

  const handleApprove = async (approval: ApprovalItem) => {
    if (!token) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      const res = await fetch(`/api/approvals/${approval.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ note: decisionNote || 'Approved via Human Approval Center' }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setFeedback({
          type: 'success',
          message: `Action '${approval.tool_name}' approved and executed successfully!`,
        });
        setActiveModal(null);
        setDecisionNote('');
        fetchApprovals();
      } else {
        setFeedback({
          type: 'error',
          message: data.error?.message || 'Failed to approve action.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during approval.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (approval: ApprovalItem) => {
    if (!token) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      const res = await fetch(`/api/approvals/${approval.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: decisionNote || 'Rejected by reviewer' }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setFeedback({
          type: 'success',
          message: `Action '${approval.tool_name}' was safely rejected. External side effect blocked.`,
        });
        setActiveModal(null);
        setDecisionNote('');
        fetchApprovals();
      } else {
        setFeedback({
          type: 'error',
          message: data.error?.message || 'Failed to reject action.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error during rejection.' });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Awaiting Review
          </span>
        );
      case 'APPROVED':
      case 'EXECUTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Approved
          </span>
        );
      case 'EXECUTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Executed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            Rejected
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const pendingCount = approvals.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
              Governance & Risk Boundary
            </span>
            <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
              Phase 17 Human-in-the-Loop
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>🛡️</span> Human Approval Center
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Inspect and authorize high-impact actions proposed by the autonomous workforce. Sensitive external mutations are halted until verified by an authorized human reviewer.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-right">
            <div className="text-xs text-slate-400">Pending Actions</div>
            <div className="text-lg font-bold text-amber-400">{pendingCount}</div>
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <span>{feedback.type === 'success' ? '✓' : '⚠️'}</span>
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {(['ALL', 'PENDING', 'APPROVED', 'EXECUTED', 'REJECTED'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === tab
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Approvals Table / Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full mb-3"></div>
          <p className="text-sm">Loading governed approvals...</p>
        </div>
      ) : approvals.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800/80">
          <div className="text-4xl mb-3">🛡️</div>
          <h3 className="text-base font-semibold text-white">No Approvals Found</h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
            {filter === 'PENDING'
              ? 'There are no pending sensitive actions awaiting human review.'
              : 'No approval records match the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => {
            const preview = approval.payload_preview || {};
            const isPending = approval.status === 'PENDING';

            return (
              <div
                key={approval.id}
                className={`p-6 rounded-2xl border transition-all ${
                  isPending
                    ? 'bg-slate-900/90 border-amber-500/40 shadow-lg shadow-amber-500/5'
                    : 'bg-slate-900/40 border-slate-800/70'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        {approval.id}
                      </span>
                      <span className="font-semibold text-white text-base flex items-center gap-2">
                        <span>✉️</span> {approval.tool_name}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                        {approval.risk_level}
                      </span>
                      {getStatusBadge(approval.status)}
                    </div>

                    {/* Action Preview */}
                    <div className="text-sm text-slate-300">
                      {preview.to && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 text-xs uppercase font-medium">Recipient:</span>
                          <span className="font-mono text-cyan-300">
                            {Array.isArray(preview.to) ? preview.to.join(', ') : preview.to}
                          </span>
                        </div>
                      )}
                      {preview.subject && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-500 text-xs uppercase font-medium">Subject:</span>
                          <span className="text-white font-medium">{preview.subject}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                      <span>Task: <button onClick={() => navigate('/app/tasks')} className="text-cyan-400 hover:underline font-mono">{approval.task_id}</button></span>
                      <span>Requested: {new Date(approval.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {approval.expires_at && isPending && (
                        <span className="text-amber-400">
                          Expires: {new Date(approval.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => setActiveModal(approval)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isPending
                          ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isPending ? '🔍 Review & Decide' : 'Inspect Details'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal (No Blind Approval) */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    {activeModal.risk_level}
                  </span>
                  {getStatusBadge(activeModal.status)}
                </div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🛡️</span> Verify External Action: {activeModal.tool_name}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Warning banner */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3">
              <span className="text-base">⚠️</span>
              <div>
                <strong>Zero Blind Approval Policy:</strong> Verify the recipient and email content below before executing. Approving triggers actual external email dispatch via the connected Gmail account.
              </div>
            </div>

            {/* Action Details */}
            <div className="space-y-3 bg-slate-950/80 p-5 rounded-2xl border border-slate-800/80 text-sm">
              <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-800">
                <span className="text-slate-500 text-xs uppercase font-semibold">Tool:</span>
                <span className="col-span-2 text-white font-mono">{activeModal.tool_name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-800">
                <span className="text-slate-500 text-xs uppercase font-semibold">Recipient:</span>
                <span className="col-span-2 text-cyan-300 font-mono">
                  {Array.isArray(activeModal.payload_preview.to)
                    ? activeModal.payload_preview.to.join(', ')
                    : activeModal.payload_preview.to}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-800">
                <span className="text-slate-500 text-xs uppercase font-semibold">Subject:</span>
                <span className="col-span-2 text-white font-medium">
                  {activeModal.payload_preview.subject}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-xs uppercase font-semibold block mb-2">Message Body Preview:</span>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {activeModal.request_payload.body || activeModal.payload_preview.bodyPreview || 'No body content'}
                </div>
              </div>
            </div>

            {/* Decision Notes Input */}
            {activeModal.status === 'PENDING' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Reviewer Decision Note (Optional):
                </label>
                <textarea
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Enter audit note or reason for decision..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-rose-500"
                />
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-5">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>

              {activeModal.status === 'PENDING' ? (
                <div className="flex items-center gap-3">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleReject(activeModal)}
                    className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {actionLoading ? 'Processing...' : '✕ Reject Action'}
                  </button>
                  <button
                    disabled={actionLoading}
                    onClick={() => handleApprove(activeModal)}
                    className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {actionLoading ? 'Executing...' : '✓ Approve & Send Email'}
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Decision recorded: {activeModal.status}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
