"use client";

import React from "react";

interface InputGroupProps {
  children: React.ReactNode;
  className?: string;
}

interface InputGroupAddonProps {
  children: React.ReactNode;
  align?: "inline-start" | "inline-end";
}

type InputGroupInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function InputGroup({ children, className = "" }: InputGroupProps) {
  return <div className={`input-group ${className}`}>{children}</div>;
}

export function InputGroupAddon({
  children,
  align = "inline-start",
}: InputGroupAddonProps) {
  return (
    <div className={`input-group-addon input-group-addon--${align}`}>
      {children}
    </div>
  );
}

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  InputGroupInputProps
>(function InputGroupInput({ className = "", ...props }, ref) {
  return (
    <input ref={ref} className={`input-group-input ${className}`} {...props} />
  );
});

export function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
