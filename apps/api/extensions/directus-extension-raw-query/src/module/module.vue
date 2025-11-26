<!-- eslint-disable vue/no-unregistered-class -->
<!-- eslint-disable vue/singleline-html-element-content-newline -->
<!-- eslint-disable vue/attribute-order -->
<template>
  <private-view title="Raw Query">
    <template #headline>
      <v-breadcrumb :items="[{ name: 'Raw Query', to: '/raw-query' }]" />
    </template>

    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="code" />
      </v-button>
    </template>

    <template #actions>
      <v-button
        @click="executeQuery"
        v-tooltip.bottom="'Execute Query (Ctrl/Cmd + Enter)'"
        rounded
        icon
        :loading="loading"
        :disabled="!query.trim()"
      >
        <v-icon name="play_arrow" />
      </v-button>
      <v-button @click="clearQuery" v-tooltip.bottom="'Clear Query'" rounded icon :disabled="!query.trim()">
        <v-icon name="clear" />
      </v-button>
    </template>

    <template #sidebar>
      <sidebar-detail icon="history" title="Query History">
        <div v-if="queryHistory.length === 0" class="history-empty">
          No query history yet
        </div>
        <div v-else class="history-list">
          <div class="history-actions">
            <v-button
              @click="clearHistory"
              x-small
              secondary
              block
              class="clear-all-btn"
            >
              <v-icon name="delete" x-small left />
              Clear All
            </v-button>
          </div>
          <div
            @click="loadHistoryQuery(item)"
            v-for="item in queryHistory"
            :key="item.id"
            class="history-item"
          >
            <div class="history-query">{{ stripComments(item.query) }}</div>
            <div class="history-time">{{ formatTimestamp(item.timestamp) }}</div>
          </div>
        </div>
      </sidebar-detail>
    </template>

    <template #navigation>
      <v-list nav class="nav">
        <v-list-item
          href="https://github.com/creazy231/directus-extension-raw-query"
          target="_blank"
          rel="noopener noreferrer"
          class="link"
        >
          <v-list-item-icon>
            <v-icon name="code" />
          </v-list-item-icon>
          <v-list-item-content>
            <span class="label">
              <div class="v-text-overflow label">View on GitHub</div>
            </span>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          href="https://ko-fi.com/creazy231"
          target="_blank"
          rel="noopener noreferrer"
          class="link"
        >
          <v-list-item-icon>
            <v-icon name="favorite" />
          </v-list-item-icon>
          <v-list-item-content>
            <span class="label">
              <div class="v-text-overflow label">Support on Ko-fi</div>
            </span>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </template>

    <div class="raw-query-container">
      <div class="editor-section">
        <div class="section-header">
          <h2>SQL Query Editor</h2>
          <span v-if="!editorLoading" class="hint">Press Ctrl/Cmd + Enter to execute</span>
        </div>

        <!-- Loading skeleton -->
        <div v-if="editorLoading" class="editor-skeleton">
          <div class="skeleton-line" />
          <div class="skeleton-line" />
          <div class="skeleton-line short" />
          <div class="skeleton-line" />
          <div class="skeleton-line medium" />
          <div class="skeleton-line" />
          <v-progress-circular indeterminate class="skeleton-spinner" />
          <span class="skeleton-text">Loading editor...</span>
        </div>

        <!-- Monaco Editor container -->
        <div
          v-show="!editorLoading"
          ref="editorContainer"
          class="monaco-editor-container"
        />
      </div>

      <div class="results-section">
        <div class="section-header">
          <h2>Results</h2>
          <span v-if="results.length > 0" class="result-count">
            {{ results.length }} {{ results.length === 1 ? 'query' : 'queries' }} executed
          </span>
        </div>

        <div v-if="results.length === 0" class="empty-state">
          <v-icon name="info" large />
          <p>Execute a query to see results here</p>
        </div>

        <div v-else class="results-list">
          <div
            v-for="(result, index) in results"
            :key="index"
            class="result-item"
            :class="{ error: !result.success }"
          >
            <div class="result-header">
              <div class="result-title">
                <v-icon :name="result.success ? 'check_circle' : 'error'" />
                <span class="query-text">{{ truncateQuery(result.query) }}</span>
              </div>
              <span v-if="result.success" class="row-count">
                {{ result.rowCount }} {{ result.rowCount === 1 ? 'row' : 'rows' }}
              </span>
            </div>

            <div v-if="!result.success" class="error-message">
              <v-notice type="danger">
                {{ result.error }}
              </v-notice>
            </div>

            <div
              v-else-if="result.data && result.data.length > 0"
              class="result-table"
            >
              <table>
                <thead>
                  <tr>
                    <th v-for="column in Object.keys(result.data[0])" :key="column">
                      {{ column }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in result.data" :key="rowIndex">
                    <td v-for="column in Object.keys(result.data[0])" :key="column">
                      {{ formatValue(row[column]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="empty-result">
              <v-notice type="info">
                Query executed successfully with no results
              </v-notice>
            </div>
          </div>
        </div>
      </div>
    </div>
  </private-view>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useApi } from "@directus/extensions-sdk";

interface QueryResult {
  query: string;
  success: boolean;
  data?: any[];
  rowCount?: number;
  error?: string;
}

interface QueryHistoryItem {
  query: string;
  timestamp: number;
  id: string;
}

interface DatabaseTable {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

const HISTORY_KEY = "directus_raw_query_history";
const DRAFT_KEY = "directus_raw_query_draft";
const MAX_HISTORY = 50;

const api = useApi();
const editorContainer = ref<HTMLElement | null>(null);
const query = ref("-- Write your SQL query here\nSELECT * FROM directus_users LIMIT 10;");
const results = ref<QueryResult[]>([]);
const loading = ref(false);
const editorLoading = ref(true);
const queryHistory = ref<QueryHistoryItem[]>([]);
const dbSchema = ref<DatabaseTable[]>([]);

const monaco = shallowRef<any>(null);
let editor: any = null;
let draftSaveTimeout: number | null = null;

async function fetchDatabaseSchema() {
  try {
    const response = await api.get("/raw-query/schema");
    if (response.data.success) {
      dbSchema.value = response.data.tables || [];
    }
  } catch (error) {
    console.error("[Raw Query] Failed to fetch database schema:", error);
  }
}

function configureSQLCompletions(monacoEditor: any) {
  if (!dbSchema.value.length) return;

  // Register SQL completion provider
  monacoEditor.languages.registerCompletionItemProvider("sql", {
    provideCompletionItems: (_model: any, _position: any) => {
      const suggestions: any[] = [];

      // Add table suggestions
      dbSchema.value.forEach((table) => {
        suggestions.push({
          label: table.name,
          kind: monacoEditor.languages.CompletionItemKind.Class,
          insertText: table.name,
          detail: "Table",
          documentation: `Table with ${table.columns.length} columns`,
        });

        // Add column suggestions for each table
        table.columns.forEach((column) => {
          suggestions.push({
            label: `${table.name}.${column.name}`,
            kind: monacoEditor.languages.CompletionItemKind.Field,
            insertText: column.name,
            detail: `${table.name} - ${column.type}`,
            documentation: `Column: ${column.name}\nType: ${column.type}\nNullable: ${column.nullable}`,
          });
        });
      });

      // Add SQL keywords
      const keywords = [
        "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT", "RIGHT",
        "INNER", "OUTER", "ON", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN", "IS", "NULL",
        "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "AS", "DISTINCT", "COUNT",
        "SUM", "AVG", "MIN", "MAX", "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "VIEW",
      ];

      keywords.forEach((keyword) => {
        suggestions.push({
          label: keyword,
          kind: monacoEditor.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          detail: "SQL Keyword",
        });
      });

      return { suggestions };
    },
  });
}

async function initializeEditor() {
  editorLoading.value = true;

  try {
    // Wait for DOM to be ready
    await nextTick();

    // Wait for the ref to be available (with timeout)
    let attempts = 0;
    const maxAttempts = 20; // 2 seconds total

    while (!editorContainer.value && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!editorContainer.value) {
      console.error("[Raw Query] Editor container not found after waiting");
      editorLoading.value = false;
      return;
    }

    // If editor already exists, dispose it first
    if (editor) {
      editor.dispose();
      editor = null;
    }

    // Dynamically import Monaco Editor
    const monacoEditor = await import("monaco-editor");
    monaco.value = monacoEditor;

    // Configure SQL completions with database schema
    configureSQLCompletions(monacoEditor);

    // Load draft query or use default
    const initialQuery = loadDraftQuery();

    editor = monacoEditor.editor.create(editorContainer.value, {
      value: initialQuery,
      language: "sql",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
    });

    // Update query ref and save draft when editor content changes
    editor.onDidChangeModelContent(() => {
      const currentQuery = editor?.getValue() || "";
      query.value = currentQuery;
      saveDraftQuery(currentQuery);
    });

    // Add keyboard shortcut for execution (Ctrl/Cmd + Enter)
    editor.addCommand(monacoEditor.KeyMod.CtrlCmd | monacoEditor.KeyCode.Enter, () => {
      executeQuery();
    });

    editorLoading.value = false;
  } catch (error) {
    console.error("[Raw Query] Failed to load Monaco Editor:", error);
    editorLoading.value = false;
  }
}

onMounted(async () => {
  loadQueryHistory();
  await fetchDatabaseSchema();
  initializeEditor();
});

onBeforeUnmount(() => {
  // Clear debounce timeout
  if (draftSaveTimeout !== null) {
    clearTimeout(draftSaveTimeout);
  }

  if (editor) {
    editor.dispose();
  }
});

function loadQueryHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      queryHistory.value = JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load query history:", error);
  }
}

function loadDraftQuery() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      query.value = draft;
      return draft;
    }
  } catch (error) {
    console.error("Failed to load draft query:", error);
  }
  return query.value;
}

function saveDraftQuery(queryText: string) {
  // Clear existing timeout
  if (draftSaveTimeout !== null) {
    clearTimeout(draftSaveTimeout);
  }

  // Debounce the save to avoid excessive localStorage writes
  draftSaveTimeout = window.setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, queryText);
    } catch (error) {
      console.error("Failed to save draft query:", error);
    }
  }, 500);
}

function saveToHistory(queryText: string) {
  // Normalize the query text for comparison (trim whitespace)
  const normalizedQuery = queryText.trim();

  // Remove any existing entries with the same query content
  const filteredHistory = queryHistory.value.filter(
    item => item.query.trim() !== normalizedQuery,
  );

  const historyItem: QueryHistoryItem = {
    query: queryText,
    timestamp: Date.now(),
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  // Add to beginning and limit to MAX_HISTORY
  queryHistory.value = [ historyItem, ...filteredHistory ].slice(0, MAX_HISTORY);

  // Save to localStorage
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(queryHistory.value));
  } catch (error) {
    console.error("Failed to save query history:", error);
  }
}

function loadHistoryQuery(historyItem: QueryHistoryItem) {
  if (editor) {
    editor.setValue(historyItem.query);
  }
  query.value = historyItem.query;
}

function clearHistory() {
  queryHistory.value = [];
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error("Failed to clear query history:", error);
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

async function executeQuery() {
  if (!query.value.trim() || loading.value) return;

  loading.value = true;
  results.value = [];

  // Save to history before executing
  saveToHistory(query.value);

  try {
    const response = await api.post("/raw-query/execute", {
      query: query.value,
    });

    if (response.data.success) {
      results.value = response.data.results;
    } else {
      results.value = [
        {
          query: query.value,
          success: false,
          error: response.data.error || "Unknown error",
        },
      ];
    }
  } catch (error: any) {
    results.value = [
      {
        query: query.value,
        success: false,
        error: error.response?.data?.error || error.message || "Failed to execute query",
      },
    ];
  } finally {
    loading.value = false;
  }
}

function clearQuery() {
  if (editor) {
    editor.setValue("");
  }
  query.value = "";
  results.value = [];

  // Clear the draft from localStorage
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.error("Failed to clear draft query:", error);
  }
}

function stripComments(queryText: string): string {
  // Remove multi-line comments /* */
  let stripped = queryText.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments --
  stripped = stripped.replace(/--[^\n]*/g, "");
  // Remove MySQL-style comments #
  stripped = stripped.replace(/#[^\n]*/g, "");
  // Clean up extra whitespace but preserve newlines
  return stripped
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n");
}

function truncateQuery(queryText: string, maxLength = 80): string {
  const stripped = stripComments(queryText);
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.substring(0, maxLength)}...`;
}

function formatValue(value: any): string {
  if (value === null) return "NULL";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
</script>

<style scoped>
.raw-query-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: var(--content-padding);
    padding-top: 0;
    min-height: calc(100vh - 180px);
}

.editor-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 40%;
    min-height: 300px;
}

.results-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 4px;
}

.section-header h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
}

.hint {
    font-size: 12px;
    color: var(--theme--foreground-subdued);
}

.result-count {
    font-size: 12px;
    color: var(--theme--foreground-subdued);
}

.monaco-editor-container {
    flex: 1;
    border: 2px solid var(--theme--border-color);
    border-radius: var(--theme--border-radius);
    overflow: hidden;
}

.editor-skeleton {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border: 2px solid var(--theme--border-color);
    border-radius: var(--theme--border-radius);
    background: var(--theme--background-subdued);
    position: relative;
}

.skeleton-line {
    height: 16px;
    background: linear-gradient(90deg,
            var(--theme--background-accent) 0%,
            var(--theme--background-normal) 50%,
            var(--theme--background-accent) 100%);
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
    border-radius: 4px;
    width: 100%;
}

.skeleton-line.short {
    width: 60%;
}

.skeleton-line.medium {
    width: 80%;
}

.skeleton-spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    --v-progress-circular-size: 48px;
    --v-progress-circular-color: var(--theme--primary);
}

.skeleton-text {
    position: absolute;
    top: calc(50% + 40px);
    left: 50%;
    transform: translateX(-50%);
    color: var(--theme--foreground-subdued);
    font-size: 14px;
    white-space: nowrap;
}

@keyframes skeleton-loading {
    0% {
        background-position: 200% 0;
    }

    100% {
        background-position: -200% 0;
    }
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px;
    color: var(--theme--foreground-subdued);
}

.empty-state p {
    margin: 0;
    font-size: 14px;
}

.results-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 4px;
}

.result-item {
    background: var(--theme--background-subdued);
    border: 2px solid var(--theme--border-color);
    border-radius: var(--theme--border-radius);
    padding: 16px;
}

.result-item.error {
    border-color: var(--theme--danger);
}

.result-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.result-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
}

.result-title .v-icon {
    color: var(--theme--success);
}

.result-item.error .result-title .v-icon {
    color: var(--theme--danger);
}

.query-text {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: var(--theme--foreground-subdued);
}

.row-count {
    font-size: 12px;
    color: var(--theme--foreground-subdued);
    font-weight: 600;
}

.error-message {
    margin-top: 8px;
}

.result-table {
    font-family: monospace;
    overflow-x: auto;
    margin-top: 8px;
    white-space: pre-wrap;
}

.result-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.result-table th {
    background: var(--theme--background-accent);
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    border: 1px solid var(--theme--border-color);
    white-space: nowrap;
}

.result-table td {
    padding: 8px 12px;
    border: 1px solid var(--theme--border-color);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.result-table tbody tr {
    transition: background-color var(--fast) var(--transition);
}

.result-table tbody tr:hover {
    background-color: var(--v-list-item-background-color-hover);
}

.empty-result {
    margin-top: 8px;
}

.header-icon {
    --v-button-background-color: var(--theme--primary-background);
    --v-button-color: var(--theme--primary);
    --v-button-background-color-hover: var(--theme--primary-subdued);
    --v-button-color-hover: var(--theme--primary);
}

.history-empty {
    padding: 12px;
    text-align: center;
    color: var(--theme--foreground-subdued);
    font-size: 14px;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.history-actions {
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme--border-color-subdued);
}

.clear-all-btn {
    width: 100%;
    justify-content: center;
}

.history-item {
    padding: 12px;
    background-color: var(--theme--background-subdued);
    border: var(--theme--border-width) solid var(--theme--border-color-subdued);
    border-radius: var(--theme--border-radius);
    cursor: pointer;
    transition: background-color var(--slow) var(--transition), border-color var(--slow) var(--transition);
}

.history-item:hover {
    background-color: var(--v-list-item-background-color-hover);
    border-color: var(--theme--border-color);
}

.history-query {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: var(--theme--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
}

.history-time {
    font-size: 11px;
    color: var(--theme--foreground-subdued);
}
</style>
