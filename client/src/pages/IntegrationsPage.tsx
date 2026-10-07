import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export interface Customer {
  id: string;
  company_name: string;
  domain: string;
  contact_name: string | null;
  contact_email: string | null;
  industry: string | null;
  status: string;
  created_at: string;
}

export const IntegrationsPage: React.FC = () => {
  const { authFetch } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchDomain, setSearchDomain] = useState('');
  const [searchResult, setSearchResult] = useState<Customer | null>(null);
  const [searchSource, setSearchSource] = useState<'cache' | 'database' | null>(null);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [newCompany, setNewCompany] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('http://localhost:3000/api/customers?limit=20');
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleDomainSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchDomain.trim()) return;

    setSearchError(null);
    setSearchResult(null);

    try {
      const res = await authFetch(
        `http://localhost:3000/api/customers/lookup?domain=${encodeURIComponent(searchDomain.trim())}`
      );
      const json = await res.json();
      if (res.status === 404) {
        setSearchError(`No customer found with domain '${searchDomain}'`);
        setSearchSource(json.source);
        setSearchLatency(json.latencyMs);
        return;
      }
      if (!res.ok) throw new Error(json.message || 'Lookup failed');

      setSearchResult(json.data);
      setSearchSource(json.source);
      setSearchLatency(json.latencyMs);
    } catch (err: any) {
      setSearchError(err.message || 'Domain lookup failed');
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.trim() || !newDomain.trim()) return;

    setCreateMsg(null);
    try {
      const res = await authFetch('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: newCompany.trim(),
          domain: newDomain.trim(),
          industry: newIndustry.trim() || undefined,
          status: 'NEW',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Creation failed');

      setCreateMsg({
        type: 'success',
        text: `Customer '${json.data.company_name}' registered. Cache invalidated!`,
      });
      setNewCompany('');
      setNewDomain('');
      setNewIndustry('');
      fetchCustomers();
    } catch (err: any) {
      setCreateMsg({ type: 'error', text: err.message || 'Failed to create customer.' });
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span className="text-xs font-mono font-medium text-cyan-300 uppercase tracking-widest">
            Phase 10 & 13 CRM
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">
          Data & Integrations Directory
        </h1>
        <p className="mt-1 text-sm text-slate-400 font-sans">
          Tenant-isolated customer records with Redis tiered caching and verified parameterized queries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Domain Lookup & Tiered Cache Demo */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
            Domain Verification Lookup
          </h2>
          <form onSubmit={handleDomainSearch} className="flex gap-2">
            <input
              type="text"
              value={searchDomain}
              onChange={(e) => setSearchDomain(e.target.value)}
              placeholder="e.g. apexcloud.io or acme.com"
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold font-sans transition"
            >
              Verify
            </button>
          </form>

          {searchLatency !== null && (
            <div className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-sans">
              <span>Source: <strong className={searchSource === 'cache' ? 'text-rose-400' : 'text-emerald-400'}>{searchSource?.toUpperCase()}</strong></span>
              <span className="font-mono text-cyan-400">{searchLatency} ms</span>
            </div>
          )}

          {searchError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-sans">
              {searchError}
            </div>
          )}

          {searchResult && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1 font-sans">
              <div className="font-semibold text-white text-sm">{searchResult.company_name}</div>
              <div className="text-slate-400">Domain: <span className="font-mono text-cyan-300">{searchResult.domain}</span></div>
              <div className="text-slate-400">Status: <span className="text-emerald-400">{searchResult.status}</span></div>
            </div>
          )}
        </div>

        {/* Create Customer */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
            Register Verified Customer
          </h2>
          {createMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-sans ${
                createMsg.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800 text-rose-300'
              }`}
            >
              {createMsg.text}
            </div>
          )}
          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-sans">Company Name</label>
                <input
                  type="text"
                  required
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Apex Cloud Inc."
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1 font-sans">Domain</label>
                <input
                  type="text"
                  required
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="apexcloud.io"
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 font-sans">Industry</label>
              <input
                type="text"
                value={newIndustry}
                onChange={(e) => setNewIndustry(e.target.value)}
                placeholder="Cloud Infrastructure"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-semibold shadow-md transition font-sans"
            >
              Add to Database
            </button>
          </form>
        </div>
      </div>

      {/* Directory Table */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
            CRM Directory Records ({customers.length})
          </h2>
          <button
            type="button"
            onClick={fetchCustomers}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition"
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500 animate-pulse font-sans">
            Loading tenant customer records...
          </div>
        ) : customers.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-sans">
            No customers found in current tenant scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="pb-2">Company</th>
                  <th className="pb-2">Domain</th>
                  <th className="pb-2">Industry</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 font-semibold text-white">{c.company_name}</td>
                    <td className="py-2.5 font-mono text-cyan-300">{c.domain}</td>
                    <td className="py-2.5 text-slate-400">{c.industry || '—'}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
