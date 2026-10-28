"use client";

import { useActionState, useState } from "react";
import {
  addAdminTeamMember,
  changeAdminPassword,
  removeTeamMember,
  toggleTeamMemberDisabled,
  updateTeamMemberRole,
  type AdminAuthState,
} from "@/lib/admin-actions";
import { Field } from "@/components/Field";
import { ROLES } from "@/lib/permissions";
import { at } from "@/lib/admin-copy/zh";
import { ROLE_LABELS_ZH } from "@/lib/admin-copy/roles";

const selectClass =
  "border border-white/20 bg-black px-2 py-1.5 text-[11px] uppercase tracking-wider";

export function TeamRowControls({ id, role, disabled }: { id: string; role: string; disabled: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={updateTeamMemberRole} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <select name="role" defaultValue={role} className={selectClass}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS_ZH[r]}
            </option>
          ))}
        </select>
        <button className="border border-white/20 px-2 py-1.5 text-[10px] uppercase tracking-wider hover:border-white">
          Save
        </button>
      </form>
      <form action={toggleTeamMemberDisabled}>
        <input type="hidden" name="id" value={id} />
        <button className="border border-white/20 px-2 py-1.5 text-[10px] uppercase tracking-wider hover:border-white">
          {disabled ? at("acc.enable") : at("acc.disable")}
        </button>
      </form>
      <form action={removeTeamMember}>
        <input type="hidden" name="id" value={id} />
        <button className="border border-red-500/40 px-2 py-1.5 text-[10px] uppercase tracking-wider text-red-400">
          {at("acc.remove")}
        </button>
      </form>
    </div>
  );
}

export function ChangePasswordForm() {
  const [pwState, pwAction, pwPending] = useActionState<AdminAuthState, FormData>(
    changeAdminPassword,
    undefined,
  );
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <form action={pwAction} className="space-y-3">
      <Field
        name="current"
        type="password"
        placeholder={at("acc.currentPassword")}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <Field
        name="password"
        type="password"
        placeholder={at("acc.newPassword")}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
      />
      <Field
        name="confirm"
        type="password"
        placeholder={at("acc.confirmPassword")}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      {pwState?.error && <p className="text-sm text-red-400">{pwState.error}</p>}
      <button
        disabled={pwPending}
        className="group flex w-full items-center justify-between bg-lime-400 py-3 pl-4 pr-3 text-xs font-black uppercase tracking-widest text-black hover:bg-white disabled:opacity-60"
      >
        {pwPending ? at("c.saving") : at("acc.updatePassword")}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}

export function AddMemberForm() {
  const [teamState, teamAction, teamPending] = useActionState<AdminAuthState, FormData>(
    addAdminTeamMember,
    undefined,
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamPassword, setTeamPassword] = useState("");

  return (
    <form action={teamAction} className="space-y-3">
      <Field name="name" placeholder={at("acc.memberName")} value={name} onChange={setName} autoComplete="off" />
      <Field
        name="email"
        type="email"
        placeholder={at("acc.memberEmail")}
        value={email}
        onChange={setEmail}
        autoComplete="off"
      />
      <Field
        name="password"
        type="password"
        placeholder={at("acc.tempPassword")}
        value={teamPassword}
        onChange={setTeamPassword}
        autoComplete="new-password"
      />
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-500">
          {at("acc.role")}
        </span>
        <select name="role" defaultValue="manager" className={selectClass + " w-full px-3 py-3 text-sm"}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS_ZH[r]}
            </option>
          ))}
        </select>
      </label>
      {teamState?.error && <p className="text-sm text-red-400">{teamState.error}</p>}
      <button
        disabled={teamPending}
        className="group flex w-full items-center justify-between border border-white/30 py-3 pl-4 pr-3 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black disabled:opacity-60"
      >
        {teamPending ? at("c.creating") : at("acc.addAdmin")}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
      </button>
    </form>
  );
}
