/**
 * MonoPrompt - Application Controller
 * Supports multi-session tabs, safe touch keypad handling (no unwanted mobile keyboard),
 * AST parsing, LocalStorage persistence, and haptic feedback.
 */

document.addEventListener('DOMContentLoaded', () => {
  let parser = new MathParser();

  // DOM Elements
  const formulaInput = document.getElementById('formulaInput');
  const previewText = document.getElementById('previewText');
  const previewRow = document.getElementById('previewRow');
  const logArea = document.getElementById('logArea');
  const varChipsContainer = document.getElementById('varChipsContainer');
  const keypadSection = document.getElementById('keypadSection');
  const toggleKeypadBtn = document.getElementById('toggleKeypadBtn');
  const toggleKeyboardModeBtn = document.getElementById('toggleKeyboardModeBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toastNotice = document.getElementById('toastNotice');
  const tabsContainer = document.getElementById('tabsContainer');
  const addTabBtn = document.getElementById('addTabBtn');

  // Modals
  const addVarModal = document.getElementById('addVarModal');
  const openAddVarBtn = document.getElementById('openAddVarBtn');
  const cancelVarBtn = document.getElementById('cancelVarBtn');
  const saveVarBtn = document.getElementById('saveVarBtn');
  const varNameInput = document.getElementById('varNameInput');
  const varValueInput = document.getElementById('varValueInput');

  const historyActionModal = document.getElementById('historyActionModal');
  const actionModalExpr = document.getElementById('actionModalExpr');
  const actionReuseExpr = document.getElementById('actionReuseExpr');
  const actionInsertResult = document.getElementById('actionInsertResult');
  const actionCopyResult = document.getElementById('actionCopyResult');
  const actionCloseModal = document.getElementById('actionCloseModal');

  // --------------------------------------------------------------------------
  // Multi-Session State
  // --------------------------------------------------------------------------
  let sessions = [];
  let activeSessionId = '';
  let historyNavIndex = -1;
  let tempCurrentInput = '';
  let selectedLogItem = null;
  let isOSKeyboardEnabled = false;

  // Haptic feedback
  const haptic = () => {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // ignore
      }
    }
  };

  // Toast notification
  let toastTimer = null;
  const showToast = (message) => {
    toastNotice.textContent = message;
    toastNotice.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 2000);
  };

  // Helper: get current active session object
  const getActiveSession = () => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0];
  };

  // --------------------------------------------------------------------------
  // LocalStorage Persistence
  // --------------------------------------------------------------------------
  const STORAGE_KEY_V2 = 'monoprompt_sessions_v2';
  const STORAGE_KEY_V1 = 'monoprompt_data_v1';

  const loadSavedData = () => {
    try {
      const v2Data = localStorage.getItem(STORAGE_KEY_V2);
      if (v2Data) {
        const parsed = JSON.parse(v2Data);
        if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          sessions = parsed.sessions;
          activeSessionId = parsed.activeSessionId || sessions[0].id;
          syncParserWithActiveSession();
          return;
        }
      }

      // Migration from v1
      const v1Data = localStorage.getItem(STORAGE_KEY_V1);
      if (v1Data) {
        const parsed = JSON.parse(v1Data);
        const migratedSession = {
          id: 'session_' + Date.now(),
          name: 'Calc 1',
          variables: parsed.variables || { ans: 0, M: 0 },
          historyLogs: parsed.historyLogs || []
        };
        sessions = [migratedSession];
        activeSessionId = migratedSession.id;
        syncParserWithActiveSession();
        saveData();
        return;
      }
    } catch (e) {
      console.warn('Failed to load session data:', e);
    }

    // Default initialization
    const defaultSession = {
      id: 'session_' + Date.now(),
      name: 'Calc 1',
      variables: { ans: 0, M: 0 },
      historyLogs: []
    };
    sessions = [defaultSession];
    activeSessionId = defaultSession.id;
    syncParserWithActiveSession();
  };

  const saveData = () => {
    try {
      // Sync active session before saving
      const active = getActiveSession();
      if (active) {
        active.variables = { ...parser.variables };
      }

      const payload = {
        activeSessionId: activeSessionId,
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          variables: s.variables,
          historyLogs: s.historyLogs.slice(-50)
        }))
      };
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save session data:', e);
    }
  };

  const syncParserWithActiveSession = () => {
    const active = getActiveSession();
    parser = new MathParser();
    if (active && active.variables) {
      Object.entries(active.variables).forEach(([k, v]) => {
        parser.setVariable(k, v);
      });
    }
  };

  // --------------------------------------------------------------------------
  // Tab Management
  // --------------------------------------------------------------------------
  const renderTabs = () => {
    tabsContainer.innerHTML = '';

    sessions.forEach(sess => {
      const tabEl = document.createElement('div');
      tabEl.className = `session-tab ${sess.id === activeSessionId ? 'active' : ''}`;
      tabEl.dataset.id = sess.id;
      tabEl.title = 'クリックで切り替え / ダブルクリックで名前変更';

      tabEl.innerHTML = `
        <span class="tab-name">${escapeHtml(sess.name)}</span>
        ${sessions.length > 1 ? '<span class="tab-close-btn" title="タブを閉じる">&times;</span>' : ''}
      `;

      // Switch tab
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close-btn')) {
          e.stopPropagation();
          deleteSession(sess.id);
        } else {
          switchSession(sess.id);
        }
      });

      // Double-click or long-press to rename
      tabEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        renameSession(sess.id);
      });

      tabsContainer.appendChild(tabEl);
    });

    // Auto-scroll active tab into view
    const activeEl = tabsContainer.querySelector('.session-tab.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  };

  const switchSession = (sessionId) => {
    if (sessionId === activeSessionId) return;
    haptic();

    // Save current active session vars
    const current = getActiveSession();
    if (current) {
      current.variables = { ...parser.variables };
    }

    activeSessionId = sessionId;
    syncParserWithActiveSession();
    formulaInput.value = '';
    historyNavIndex = -1;

    saveData();
    renderTabs();
    renderVariableChips();
    renderHistory();
    updateLivePreview();
  };

  const createNewSession = () => {
    haptic();
    const newSession = {
      id: 'session_' + Date.now(),
      name: `Calc ${sessions.length + 1}`,
      variables: { ans: 0, M: 0 },
      historyLogs: []
    };
    sessions.push(newSession);
    switchSession(newSession.id);
    showToast(`タブ "${newSession.name}" を作成しました`);
  };

  const deleteSession = (sessionId) => {
    haptic();
    if (sessions.length <= 1) {
      showToast('最後のタブは削除できません');
      return;
    }

    const index = sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return;

    const targetName = sessions[index].name;
    sessions.splice(index, 1);

    if (activeSessionId === sessionId) {
      const nextIndex = Math.max(0, index - 1);
      activeSessionId = sessions[nextIndex].id;
      syncParserWithActiveSession();
    }

    saveData();
    renderTabs();
    renderVariableChips();
    renderHistory();
    showToast(`"${targetName}" を削除しました`);
  };

  const renameSession = (sessionId) => {
    const sess = sessions.find(s => s.id === sessionId);
    if (!sess) return;
    const newName = prompt('タブ名を入力してください:', sess.name);
    if (newName && newName.trim()) {
      sess.name = newName.trim().slice(0, 20);
      saveData();
      renderTabs();
    }
  };

  addTabBtn.addEventListener('click', () => {
    createNewSession();
  });

  // --------------------------------------------------------------------------
  // Variable Chips Rendering
  // --------------------------------------------------------------------------
  const renderVariableChips = () => {
    varChipsContainer.innerHTML = '';

    // Render Memory chip first
    const memVal = parser.variables.M || 0;
    const memChip = document.createElement('div');
    memChip.className = 'var-chip memory-chip';
    memChip.title = 'タップで現在の式にMを挿入';
    memChip.innerHTML = `
      <span class="var-name">M:</span>
      <span class="var-val">${MathParser.formatNumber(memVal)}</span>
      <span class="var-del-btn" title="メモリをクリア (MC)">&times;</span>
    `;
    memChip.addEventListener('click', (e) => {
      if (e.target.classList.contains('var-del-btn')) {
        e.stopPropagation();
        parser.setVariable('M', 0);
        saveData();
        renderVariableChips();
        showToast('メモリをクリアしました');
      } else {
        insertTextAtCursor('M');
      }
    });
    varChipsContainer.appendChild(memChip);

    // Render other user variables
    const vars = parser.getVariablesList().filter(v => v.name !== 'M');
    vars.forEach(({ name, value }) => {
      const chip = document.createElement('div');
      chip.className = 'var-chip';
      chip.title = `タップで "${name}" を式に挿入`;
      chip.innerHTML = `
        <span class="var-name">${escapeHtml(name)}:</span>
        <span class="var-val">${MathParser.formatNumber(value)}</span>
        <span class="var-del-btn" title="削除">&times;</span>
      `;
      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('var-del-btn')) {
          e.stopPropagation();
          parser.removeVariable(name);
          saveData();
          renderVariableChips();
          updateLivePreview();
          showToast(`変数 "${name}" を削除しました`);
        } else {
          insertTextAtCursor(name);
        }
      });
      varChipsContainer.appendChild(chip);
    });
  };

  // --------------------------------------------------------------------------
  // History Log Rendering
  // --------------------------------------------------------------------------
  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const renderHistory = () => {
    const active = getActiveSession();
    const historyLogs = active ? active.historyLogs : [];

    // Clear existing cards
    logArea.innerHTML = '';

    historyLogs.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `log-card ${item.isError ? 'error' : ''}`;
      card.dataset.index = index;

      let tagHtml = '';
      if (item.isAssignment) {
        tagHtml = `<span class="log-tag">Variable</span>`;
      }

      card.innerHTML = `
        ${tagHtml}
        <div class="log-expr-line">
          <span class="log-prompt-sym">&gt;</span>
          <span>${escapeHtml(item.expr)}</span>
        </div>
        <div class="log-result-line">
          ${item.isError ? escapeHtml(item.result) : `= ${MathParser.formatNumber(item.result)}`}
        </div>
      `;

      card.addEventListener('click', () => {
        haptic();
        openHistoryAction(item);
      });

      logArea.appendChild(card);
    });

    // Scroll to bottom
    logArea.scrollTop = logArea.scrollHeight;
  };

  // --------------------------------------------------------------------------
  // Real-time Preview & Input Handling
  // --------------------------------------------------------------------------
  const updateLivePreview = () => {
    const inputVal = formulaInput.value;
    if (!inputVal.trim()) {
      previewText.textContent = '';
      previewRow.classList.remove('has-error');
      return;
    }

    const previewVal = parser.preview(inputVal);
    if (previewVal !== null) {
      previewText.textContent = `= ${MathParser.formatNumber(previewVal)}`;
      previewRow.classList.remove('has-error');
    } else {
      previewText.textContent = '';
    }
  };

  formulaInput.addEventListener('input', () => {
    updateLivePreview();
  });

  // Insert text at current cursor position without triggering virtual keyboard
  const insertTextAtCursor = (text) => {
    haptic();
    const start = formulaInput.selectionStart ?? formulaInput.value.length;
    const end = formulaInput.selectionEnd ?? formulaInput.value.length;
    const current = formulaInput.value;

    formulaInput.value = current.substring(0, start) + text + current.substring(end);
    const newPos = start + text.length;

    // Set cursor position
    formulaInput.setSelectionRange(newPos, newPos);

    // If OS keyboard is enabled, keep focus. Otherwise just maintain caret without popping keyboard
    if (isOSKeyboardEnabled) {
      formulaInput.focus();
    }

    updateLivePreview();
  };

  // Backspace from cursor
  const performBackspace = () => {
    haptic();
    const start = formulaInput.selectionStart ?? formulaInput.value.length;
    const end = formulaInput.selectionEnd ?? formulaInput.value.length;
    const current = formulaInput.value;

    if (start === end) {
      if (start > 0) {
        formulaInput.value = current.substring(0, start - 1) + current.substring(end);
        formulaInput.setSelectionRange(start - 1, start - 1);
      }
    } else {
      formulaInput.value = current.substring(0, start) + current.substring(end);
      formulaInput.setSelectionRange(start, start);
    }

    if (isOSKeyboardEnabled) {
      formulaInput.focus();
    }
    updateLivePreview();
  };

  // --------------------------------------------------------------------------
  // Execution (Evaluate)
  // --------------------------------------------------------------------------
  const executeEvaluation = () => {
    haptic();
    const expr = formulaInput.value.trim();
    if (!expr) return;

    const active = getActiveSession();
    if (!active) return;

    try {
      const evalRes = parser.evaluate(expr);
      const logItem = {
        expr: expr,
        result: evalRes.result,
        isAssignment: evalRes.isAssignment,
        isError: false,
        time: Date.now()
      };
      active.historyLogs.push(logItem);

      formulaInput.value = '';
      updateLivePreview();
      renderHistory();
      renderVariableChips();
      saveData();
      historyNavIndex = -1;
    } catch (err) {
      const errorLog = {
        expr: expr,
        result: err.message || '計算エラー',
        isAssignment: false,
        isError: true,
        time: Date.now()
      };
      active.historyLogs.push(errorLog);
      renderHistory();
      saveData();
    }
  };

  // --------------------------------------------------------------------------
  // Memory Operations (M+, M-, MR, MC)
  // --------------------------------------------------------------------------
  const handleMemoryOp = (action) => {
    haptic();
    const currentM = parser.variables.M || 0;

    switch (action) {
      case 'mc':
        parser.setVariable('M', 0);
        showToast('MC: メモリを 0 にしました');
        break;

      case 'mr':
        insertTextAtCursor(String(currentM));
        showToast(`MR: ${MathParser.formatNumber(currentM)} を呼び出しました`);
        break;

      case 'm-plus':
      case 'm-minus': {
        const inputVal = formulaInput.value.trim();
        let valueToAdd = 0;

        if (inputVal) {
          try {
            const evalRes = parser.evaluate(inputVal);
            valueToAdd = evalRes.result;
          } catch {
            showToast('式が正しくありません');
            return;
          }
        } else {
          valueToAdd = parser.variables.ans || 0;
        }

        const newM = action === 'm-plus' 
          ? parser.cleanFloat(currentM + valueToAdd)
          : parser.cleanFloat(currentM - valueToAdd);

        parser.setVariable('M', newM);
        showToast(`${action === 'm-plus' ? 'M+' : 'M−'}: M = ${MathParser.formatNumber(newM)}`);
        break;
      }
    }

    renderVariableChips();
    saveData();
  };

  // --------------------------------------------------------------------------
  // History Navigation (Up / Down)
  // --------------------------------------------------------------------------
  const navigateHistory = (direction) => {
    haptic();
    const active = getActiveSession();
    if (!active) return;
    const validLogs = active.historyLogs.filter(item => !item.isError);
    if (validLogs.length === 0) return;

    if (historyNavIndex === -1) {
      tempCurrentInput = formulaInput.value;
      historyNavIndex = validLogs.length;
    }

    if (direction === 'up') {
      if (historyNavIndex > 0) {
        historyNavIndex--;
        formulaInput.value = validLogs[historyNavIndex].expr;
      }
    } else if (direction === 'down') {
      if (historyNavIndex < validLogs.length - 1) {
        historyNavIndex++;
        formulaInput.value = validLogs[historyNavIndex].expr;
      } else {
        historyNavIndex = -1;
        formulaInput.value = tempCurrentInput;
      }
    }

    if (isOSKeyboardEnabled) {
      formulaInput.focus();
    }
    updateLivePreview();
  };

  // --------------------------------------------------------------------------
  // Keypad Touch/Click Routing (Prevent Unwanted OS Keyboard)
  // --------------------------------------------------------------------------
  // CRITICAL: Use pointerdown with preventDefault to completely stop mobile browser from popping software keyboard
  keypadSection.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.key-btn');
    if (!btn) return;
    if (!isOSKeyboardEnabled) {
      e.preventDefault(); // Prevents input focus stealing / OS keyboard trigger
    }
  });

  keypadSection.addEventListener('click', (e) => {
    const btn = e.target.closest('.key-btn');
    if (!btn) return;

    const insertVal = btn.dataset.insert;
    const actionVal = btn.dataset.action;

    if (insertVal !== undefined) {
      insertTextAtCursor(insertVal);
    } else if (actionVal) {
      switch (actionVal) {
        case 'evaluate':
          executeEvaluation();
          break;
        case 'clear':
          haptic();
          formulaInput.value = '';
          updateLivePreview();
          break;
        case 'backspace':
          performBackspace();
          break;
        case 'history-up':
          navigateHistory('up');
          break;
        case 'mc':
        case 'mr':
        case 'm-plus':
        case 'm-minus':
          handleMemoryOp(actionVal);
          break;
      }
    }
  });

  // --------------------------------------------------------------------------
  // Toggle OS Mobile Keyboard Button
  // --------------------------------------------------------------------------
  toggleKeyboardModeBtn.addEventListener('click', () => {
    haptic();
    isOSKeyboardEnabled = !isOSKeyboardEnabled;

    if (isOSKeyboardEnabled) {
      formulaInput.setAttribute('inputmode', 'text');
      toggleKeyboardModeBtn.classList.add('active');
      formulaInput.focus();
      showToast('ソフトウェアキーボード: ON');
    } else {
      formulaInput.setAttribute('inputmode', 'none');
      toggleKeyboardModeBtn.classList.remove('active');
      formulaInput.blur();
      showToast('ソフトウェアキーボード: OFF (電卓専用モード)');
    }
  });

  // --------------------------------------------------------------------------
  // Keyboard Events (PC physical keyboard)
  // --------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (addVarModal.classList.contains('open') || historyActionModal.classList.contains('open')) {
      if (e.key === 'Escape') closeModals();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeEvaluation();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    } else if (e.key === 'Escape') {
      formulaInput.value = '';
      updateLivePreview();
    }
  });

  // --------------------------------------------------------------------------
  // History Item Action Modal
  // --------------------------------------------------------------------------
  const openHistoryAction = (item) => {
    selectedLogItem = item;
    actionModalExpr.textContent = item.isError 
      ? item.expr 
      : `${item.expr} = ${MathParser.formatNumber(item.result)}`;
    historyActionModal.classList.add('open');
  };

  actionReuseExpr.addEventListener('click', () => {
    if (selectedLogItem) {
      formulaInput.value = selectedLogItem.expr;
      updateLivePreview();
      closeModals();
      showToast('式を入力欄にセットしました');
    }
  });

  actionInsertResult.addEventListener('click', () => {
    if (selectedLogItem && !selectedLogItem.isError) {
      insertTextAtCursor(String(selectedLogItem.result));
      closeModals();
      showToast('結果を挿入しました');
    }
  });

  actionCopyResult.addEventListener('click', async () => {
    if (selectedLogItem) {
      const valToCopy = String(selectedLogItem.result);
      try {
        await navigator.clipboard.writeText(valToCopy);
        showToast(`コピー: ${valToCopy}`);
      } catch {
        showToast('コピーに失敗しました');
      }
      closeModals();
    }
  });

  actionCloseModal.addEventListener('click', () => {
    closeModals();
  });

  // --------------------------------------------------------------------------
  // Add Variable Modal
  // --------------------------------------------------------------------------
  openAddVarBtn.addEventListener('click', () => {
    haptic();
    varNameInput.value = '';
    varValueInput.value = '';
    addVarModal.classList.add('open');
    setTimeout(() => varNameInput.focus(), 50);
  });

  cancelVarBtn.addEventListener('click', () => {
    closeModals();
  });

  saveVarBtn.addEventListener('click', () => {
    const name = varNameInput.value.trim();
    const valExpr = varValueInput.value.trim();

    if (!name) {
      alert('変数名を入力してください');
      return;
    }

    try {
      const res = parser.evaluate(valExpr);
      parser.setVariable(name, res.result);
      renderVariableChips();
      saveData();
      closeModals();
      showToast(`変数 "${name} = ${res.result}" を登録しました`);
    } catch (err) {
      alert(`値のエラー: ${err.message}`);
    }
  });

  const closeModals = () => {
    addVarModal.classList.remove('open');
    historyActionModal.classList.remove('open');
    selectedLogItem = null;
  };

  [addVarModal, historyActionModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  // --------------------------------------------------------------------------
  // Header Actions
  // --------------------------------------------------------------------------
  toggleKeypadBtn.addEventListener('click', () => {
    haptic();
    keypadSection.classList.toggle('collapsed');
    const isCollapsed = keypadSection.classList.contains('collapsed');
    toggleKeypadBtn.style.opacity = isCollapsed ? '0.4' : '1';
  });

  clearHistoryBtn.addEventListener('click', () => {
    haptic();
    const active = getActiveSession();
    if (!active || active.historyLogs.length === 0) return;
    if (confirm(`タブ "${active.name}" の履歴をすべて消去しますか？`)) {
      active.historyLogs = [];
      saveData();
      renderHistory();
      showToast('履歴を消去しました');
    }
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  loadSavedData();
  renderTabs();
  renderVariableChips();
  renderHistory();
});
