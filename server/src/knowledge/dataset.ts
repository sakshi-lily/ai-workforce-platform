/**
 * Phase 11 — Controlled Enterprise Knowledge Base Dataset
 *
 * Provides authoritative internal unstructured documents for semantic retrieval testing,
 * tenant isolation verification, and baseline evaluation.
 */

export interface KnowledgeDocument {
  id: string;
  organizationId: string;
  title: string;
  source: string;
  sourceType: "policy" | "guide" | "architecture" | "playbook";
  version: number;
  content: string;
}

export const INITIAL_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "doc-emp-handbook",
    organizationId: "org-demo-001",
    title: "Employee Handbook — Remote Work & Workplace Policies",
    source: "employee-handbook.md",
    sourceType: "policy",
    version: 1,
    content: `
# Employee Handbook: Remote Work & Attendance Policy

## Remote Work Guidelines
Employees may work remotely up to three days per week, subject to team requirements and manager approval. All remote workers are expected to maintain an ergonomic, secure home workspace with reliable high-speed broadband internet.

## Core Working Hours
Standard core collaboration hours across the organization are 10:00 AM to 4:00 PM local time. All employees are expected to be available for synchronous communication on team channels during core hours.

## Equipment and Telework Stipend
Eligible full-time employees may expense up to $500 annually for approved home office ergonomics, monitors, and peripherals upon submission of valid itemized receipts to People Ops via the expense portal.
    `.trim(),
  },
  {
    id: "doc-support-sla",
    organizationId: "org-demo-001",
    title: "Customer Support Service Level Agreement (SLA) & Incident Guide",
    source: "support-sla-guide.md",
    sourceType: "guide",
    version: 1,
    content: `
# Customer Support SLA Protocol

## Initial Response Times
All customer support tickets must receive an initial response within four business hours of submission. First-touch responses must acknowledge the issue, assign a ticket owner, and provide an initial assessment.

## Incident Severity Levels
- P1 (Critical Production Outage): Initial triage within 30 minutes, hourly stakeholder updates, 24/7 on-call dispatch.
- P2 (Major Degradation): Initial triage within 2 hours, updates every 4 hours.
- P3 (Normal Question / Minor Bug): Initial response within 4 business hours.

## Operating Schedule
Standard customer support hours are Monday through Friday, 8:00 AM to 8:00 PM Eastern Time (EST). Emergency P1 support is available 24/7/365.
    `.trim(),
  },
  {
    id: "doc-platform-architecture",
    organizationId: "org-demo-001",
    title: "AI Workforce Platform Architecture & Engineering Overview",
    source: "platform-architecture.md",
    sourceType: "architecture",
    version: 1,
    content: `
# AI Workforce Platform Architecture

## Core Storage Boundaries
- MySQL 8.4 serves as the authoritative source of truth for all structured business entities, customer directories, tasks, and audit logs.
- Redis 8.10 is deployed as an in-memory cache, rate limiter, and distributed coordination layer.
- Qdrant Vector Database indexes internal unstructured knowledge chunks for semantic retrieval.

## Agent Host Execution Model
The Agent Host enforces strict state machines, watchdogs (bounded execution cycles, maximum tool invocations, and timeouts), and tenant context isolation. Tools are executed inside host-controlled boundaries; the LLM never directly connects to external services.
    `.trim(),
  },
  {
    id: "doc-security-compliance",
    organizationId: "org-demo-001",
    title: "Information Security, Cryptography & Compliance Policy",
    source: "security-compliance-policy.md",
    sourceType: "policy",
    version: 1,
    content: `
# Information Security & Compliance Standards

## Cryptographic Standards
All customer and company confidential data at rest must be encrypted using AES-256-GCM. All data in transit across public networks must strictly enforce TLS 1.3 with modern cipher suites.

## Access Control & Credentials
Production database access is strictly restricted by role-based access control (RBAC) and multi-factor authentication (MFA). API keys, database passwords, and provider credentials must never be committed to Git repositories or exposed in LLM prompts.

## Audit Logging & Retention
All administrative actions, data exports, and tool executions must be persisted to tamper-evident audit logs with a minimum retention period of 365 days.
    `.trim(),
  },
  {
    id: "doc-sales-playbook",
    organizationId: "org-demo-001",
    title: "Enterprise Sales ICP Playbook & Opportunity Qualification",
    source: "sales-icp-playbook.md",
    sourceType: "playbook",
    version: 1,
    content: `
# Enterprise Sales Qualification Playbook

## Ideal Customer Profile (ICP)
Our target ICP consists of B2B SaaS and technology companies with 50 to 5,000 employees. Key target buyers include VP of Engineering, Chief Technology Officer, and Operations Directors seeking workflow automation.

## Qualification Criteria (BANT)
- Budget: Verified annual budget allocation exceeding $25,000.
- Authority: Direct access to technical or executive decision maker.
- Need: High-volume customer inquiry backlog or multi-step workflow bottleneck.
- Timeline: Target implementation horizon within 60 calendar days.
    `.trim(),
  },

  // Isolated Tenant B Document for strict multi-tenant boundary verification
  {
    id: "doc-tenant-b-confidential",
    organizationId: "org-tenant-b",
    title: "Tenant B Confidential M&A Strategy & Acquisition Targets",
    source: "tenant-b-mergers.md",
    sourceType: "playbook",
    version: 1,
    content: `
# Tenant B Confidential Strategy (Restricted Access)

## Project Horizon Acquisition Roadmap
Project Horizon represents Tenant B's confidential Q4 acquisition roadmap targeting autonomous robotics startups with $10M committed capital.
This document is strictly restricted to Tenant B authorized personnel and must never be disclosed to external parties or other tenants.
    `.trim(),
  },
];
