"use client";

const base =
  "w-full border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-lime-400";

export function Field({
  name,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      name={name}
      type={type}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={base}
    />
  );
}
