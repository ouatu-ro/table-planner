import { MetaPill } from "../../design-system/composition";

interface AppHeaderProps {
  groupCount: number;
  tableCount: number;
}

export function AppHeader(props: AppHeaderProps) {
  return (
    <header class="app-header">
      <div class="hero-block">
        <p class="eyebrow">Local-first seating planner</p>
        <h1>Wedding Table Planner</h1>
        <p class="subtitle">Groups are the seatable unit. Guests are individuals inside those groups.</p>
        <div class="hero-summary">
          <MetaPill>{props.groupCount} groups</MetaPill>
          <MetaPill>{props.tableCount} tables</MetaPill>
        </div>
      </div>
    </header>
  );
}
