import { splitProps } from "solid-js";
import type { ComponentProps, JSX, ParentProps } from "solid-js";

function cx(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "utility";
  size?: "xs" | "sm" | "md";
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["class", "variant", "size"]);
  return (
    <button
      class={cx("ui-button", local.class)}
      data-variant={local.variant ?? "primary"}
      data-size={local.size ?? "md"}
      {...rest}
    />
  );
}

export function StatCard(props: ParentProps<{ label: string; class?: string }>) {
  return (
    <article class={cx("stat-card", props.class)}>
      <span>{props.label}</span>
      <strong>{props.children}</strong>
    </article>
  );
}

export function FileButton(
  props: ParentProps<
    JSX.LabelHTMLAttributes<HTMLLabelElement> & {
      variant?: "primary" | "secondary" | "ghost" | "utility";
      size?: "xs" | "sm" | "md";
    }
  >,
) {
  const [local, rest] = splitProps(props, ["class", "children", "variant", "size"]);
  return (
    <label
      class={cx("ui-button", "file-button", local.class)}
      data-variant={local.variant ?? "secondary"}
      data-size={local.size ?? "md"}
      {...rest}
    >
      {local.children}
    </label>
  );
}
