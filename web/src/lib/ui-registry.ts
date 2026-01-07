export type ToolName = "Watcher" | "Analyzer" | "Static Site";

export interface UiComponentDescriptor {
  tool: ToolName;
  section: string;
  component: string;
}

export const UI_COMPONENTS = {
  "watcher.agents.pane": {
    tool: "Watcher",
    section: "Agents",
    component: "Agent Pane"
  },
  "watcher.repos.pane": {
    tool: "Watcher",
    section: "Repos",
    component: "Projects Pane"
  },
  "watcher.ports.pane": {
    tool: "Watcher",
    section: "Ports",
    component: "Ports Pane"
  },
  "watcher.activity.pane": {
    tool: "Watcher",
    section: "Activity",
    component: "Activity Feed"
  },
  "watcher.command.pane": {
    tool: "Watcher",
    section: "Command",
    component: "Command Center"
  },
  "watcher.settings.pane": {
    tool: "Watcher",
    section: "Settings",
    component: "Watcher Settings"
  },
  "analyzer.conversations.pane": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Conversations Pane"
  },
  "analyzer.analytics.pane": {
    tool: "Analyzer",
    section: "Analytics",
    component: "Analytics Pane"
  },
  "analyzer.projects.pane": {
    tool: "Analyzer",
    section: "Projects",
    component: "Projects Pane"
  },
  "analyzer.share.pane": {
    tool: "Analyzer",
    section: "Share",
    component: "Share Pane"
  },
  "analyzer.docs.pane": {
    tool: "Analyzer",
    section: "Docs",
    component: "Documentation Pane"
  },
  "analyzer.settings.pane": {
    tool: "Analyzer",
    section: "Settings",
    component: "Settings Pane"
  },
  "static.share.pane": {
    tool: "Static Site",
    section: "Share",
    component: "Share Pane"
  }
} as const satisfies Record<string, UiComponentDescriptor>;

export type ComponentId = keyof typeof UI_COMPONENTS;

export function getComponentDescriptor(id: ComponentId): UiComponentDescriptor {
  return UI_COMPONENTS[id];
}

export function formatComponentName(
  descriptor: UiComponentDescriptor
): string {
  return `${descriptor.tool}:${descriptor.section}:${descriptor.component}`;
}

export function getComponentLabel(id: ComponentId): string {
  return formatComponentName(UI_COMPONENTS[id]);
}
