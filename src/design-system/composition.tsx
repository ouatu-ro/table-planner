import { Dynamic } from "solid-js/web";
import { Show, splitProps } from "solid-js";
import type { JSX, ParentProps } from "solid-js";

function cx(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function MetaPill(props: ParentProps<{ class?: string; tone?: "default" | "info" | "warning" | "danger" }>) {
  return (
    <span class={cx("meta-pill", props.class)} data-tone={props.tone ?? "default"}>
      {props.children}
    </span>
  );
}

export function SectionIntro(props: { title: string; copy?: string; meta?: JSX.Element; level?: 2 | 3; class?: string }) {
  const headingTag = (props.level ?? 2) === 2 ? "h2" : "h3";
  return (
    <div class={cx("section-intro", props.class)}>
      <div>
        <Dynamic component={headingTag}>{props.title}</Dynamic>
        <Show when={props.copy}>
          <p class="section-copy">{props.copy}</p>
        </Show>
      </div>
      <Show when={props.meta}>
        <div class="section-intro-meta">{props.meta}</div>
      </Show>
    </div>
  );
}

export function DisclosureSection(
  props: ParentProps<{
    title: string;
    copy?: string;
    meta?: JSX.Element;
    open?: boolean;
    class?: string;
    level?: 2 | 3;
    inner?: boolean;
  }>,
) {
  const [local, rest] = splitProps(props, ["title", "copy", "meta", "open", "class", "children", "level", "inner"]);
  return (
    <details class={cx("panel-disclosure", local.inner && "inner-disclosure", local.class)} open={local.open} {...rest}>
      <summary class="disclosure-summary">
        <SectionIntro title={local.title} copy={local.copy} meta={local.meta} level={local.level} />
      </summary>
      <div class="disclosure-body">{local.children}</div>
    </details>
  );
}

export function MetaGrid(props: ParentProps<{ class?: string; compact?: boolean }>) {
  return <div class={cx("detail-meta-grid", props.compact && "detail-meta-grid-compact", props.class)}>{props.children}</div>;
}

export function MetaItem(props: { label: string; value: JSX.Element; class?: string }) {
  return (
    <div class={cx("meta-item", props.class)}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function MetaRow(props: { label: string; value: JSX.Element; class?: string }) {
  return (
    <div class={cx("meta-row", props.class)}>
      <span>{props.label}</span>
      <strong class="meta-value">{props.value}</strong>
    </div>
  );
}
