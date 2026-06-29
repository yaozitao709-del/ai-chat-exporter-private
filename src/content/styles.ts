export const panelStyles = `
:host {
  color: #182235;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.5;
}

* {
  box-sizing: border-box;
}

button,
input,
select {
  font: inherit;
}

.float-button {
  position: fixed;
  right: 22px;
  bottom: 96px;
  z-index: 2147483646;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 76px;
  height: 42px;
  border: 0;
  border-radius: 21px;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.3);
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.float-button:hover {
  background: #1d4ed8;
}

.float-button[data-hidden="true"] {
  display: none;
}

.panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  display: none;
  pointer-events: none;
}

.panel-backdrop[data-open="true"] {
  display: block;
}

.panel {
  position: fixed;
  top: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  display: flex;
  width: min(360px, calc(100vw - 36px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
  pointer-events: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e7edf5;
  cursor: move;
  user-select: none;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
}

.provider-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  margin-top: 5px;
  padding: 0 9px;
  border-radius: 999px;
  background: #edf5ff;
  color: #1d4ed8;
  font-size: 12px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #d6dfeb;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.icon-button:hover {
  background: #f8fafc;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 12px 16px 16px;
  background: #f8fbff;
}

.compact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
  background: #fff;
  color: #182235;
  cursor: pointer;
  font-weight: 650;
}

.button:hover {
  background: #f1f5fb;
}

.button.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.button.primary:hover {
  background: #1d4ed8;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.compact-settings {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.form-grid {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.advanced-details,
.selection-details {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #e0e8f2;
  border-radius: 8px;
  background: #fff;
}

.advanced-details summary,
.selection-details summary {
  cursor: pointer;
  color: #334155;
  font-size: 13px;
  font-weight: 750;
}

.field {
  display: grid;
  gap: 5px;
}

.field label,
.toggle-label {
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.field input,
.field select {
  width: 100%;
  height: 36px;
  border: 1px solid #cfd9e8;
  border-radius: 7px;
  background: #fff;
  color: #182235;
  padding: 0 10px;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  accent-color: #2563eb;
}

.mini-status {
  display: flex;
  min-height: 30px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 7px 9px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 12px;
}

.mini-status.warning {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #9a3412;
}

.quiet-danger {
  width: 100%;
  min-height: 34px;
  margin: 0 0 10px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff5f5;
  color: #b91c1c;
  cursor: pointer;
  font-weight: 700;
}

.quiet-danger:hover {
  background: #fee2e2;
}

.range-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: end;
  margin-top: 10px;
  padding: 0;
  border: 0;
  background: transparent;
}

.range-grid .button {
  grid-column: 1 / -1;
  min-width: 92px;
}

.quick-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 9px 10px;
  border: 1px solid #e0e8f2;
  border-radius: 8px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.chip-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid #cfd9e8;
  border-radius: 999px;
  background: #f8fafc;
  color: #1e3a8a;
  padding: 0 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.chip-button:hover {
  background: #eff6ff;
}

.load-state {
  margin-left: auto;
  color: #64748b;
  font-weight: 650;
}

.messages {
  display: grid;
  margin-top: 10px;
  gap: 10px;
}

.message-row {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e0e8f2;
  border-radius: 8px;
  background: #fff;
}

.message-row input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: #2563eb;
}

.message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}

.role {
  font-weight: 750;
  color: #1e3a8a;
}

.message-preview {
  display: -webkit-box;
  overflow: hidden;
  color: #243044;
  font-size: 13px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-wrap;
}

.empty {
  padding: 28px 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #64748b;
  text-align: center;
}

@media (max-width: 560px) {
  .panel {
    inset: 8px;
    width: auto;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .range-grid {
    grid-template-columns: 1fr;
  }
}
`;
