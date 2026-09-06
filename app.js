/**
 * AlternativeCalc - Application Controller
 * Supports:
 * - Multi-session tabs & Branching (枝分かれ)
 * - Reactive variable chaining (taxA=1.1 -> taxB=taxA -> taxA=1.08 cascades to taxB)
 * - Safe touch keypad handling (no unwanted mobile OS keyboard)
 * - Smart smart-parentheses auto-pairing at end-of-line
 * - Dual Light/Dark themes (system preference compliant)
 * - In-app Help popup guide
 * Version: 1.0
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
  const toggleKeyboardModeBtn = document.getElementById('toggleKeyboardModeBtn');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const openHelpBtn = document.getElementById('openHelpBtn');
  const toastNotice = document.getElementById('toastNotice');
  const tabsContainer = document.getElementById('tabsContainer');
  const addTabBtn = document.getElementById('addTabBtn');

  // Modals
  const helpModal = document.getElementById('helpModal');
  const closeHelpBtn = document.getElementById('closeHelpBtn');

  const addVarModal = document.getElementById('addVarModal');
  const openAddVarBtn = document.getElementById('openAddVarBtn');
  const cancelVarBtn = document.getElementById('cancelVarBtn');
  const saveVarBtn = document.getElementById('saveVarBtn');
  const varNameInput = document.getElementById('varNameInput');
  const varValueInput = document.getElementById('varValueInput');

  const historyActionModal = document.getElementById('historyActionModal');
  const actionModalExpr = document.getElementById('actionModalExpr');
  const actionBranchOut = document.getElementById('actionBranchOut');
  const actionReuseExpr = document.getElementById('actionReuseExpr');
  const actionInsertResult = document.getElementById('actionInsertResult');
  const actionCopyResult = document.getElementById('actionCopyResult');
  const actionCloseModal = document.getElementById('actionCloseModal');

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  let sessions = [];
  let activeSessionId = '';
  let historyNavIndex = -1;
  let tempCurrentInput = '';
  let selectedLogItem = null;
  let selectedLogIndex = -1;
  let isOSKeyboardEnabled = false;

  // Caret tracking for robust cursor restoration on mobile/Android
  let lastSelectionStart = 0;
  let lastSelectionEnd = 0;

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

  const getActiveSession = () => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0];
  };

  // --------------------------------------------------------------------------
  // LocalStorage Persistence
  // --------------------------------------------------------------------------
  const STORAGE_KEY = 'alternativecalc_sessions_v1';
  const STORAGE_KEY_FALLBACK = 'varcalc_sessions_v1';

  const loadSavedData = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_FALLBACK);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
          sessions = parsed.sessions;
          activeSessionId = parsed.activeSessionId || sessions[0].id;
          syncParserWithActiveSession();
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load session data:', e);
    }

    // Default session
    const defaultSession = {
      id: 'session_' + Date.now(),
      name: 'Calc 1',
      variables: {},
      historyLogs: []
    };
    sessions = [defaultSession];
    activeSessionId = defaultSession.id;
    syncParserWithActiveSession();
  };

  const saveData = () => {
    try {
      const active = getActiveSession();
      if (active) {
        active.variables = JSON.parse(JSON.stringify(parser.variables));
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save session data:', e);
    }
  };

  const syncParserWithActiveSession = () => {
    const active = getActiveSession();
    parser = new MathParser();
    if (active && active.variables) {
      Object.entries(active.variables).forEach(([k, data]) => {
        if (data && typeof data === 'object' && 'expr' in data) {
          parser.setVariable(k, data.expr);
        } else if (typeof data === 'number') {
          parser.setVariable(k, String(data));
        }
      });
    }
  };

  // --------------------------------------------------------------------------
  // Tab Management & Branching (枝分かれ)
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

      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close-btn')) {
          e.stopPropagation();
          deleteSession(sess.id);
        } else {
          switchSession(sess.id);
        }
      });

      tabEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        renameSession(sess.id);
      });

      tabsContainer.appendChild(tabEl);
    });

    const activeEl = tabsContainer.querySelector('.session-tab.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
  };

  const switchSession = (sessionId) => {
    if (sessionId === activeSessionId) return;
    haptic();

    const current = getActiveSession();
    if (current) {
      current.variables = JSON.parse(JSON.stringify(parser.variables));
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
      variables: {},
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
    const vars = parser.getVariablesList();

    vars.forEach(({ name, expr, value }) => {
      const chip = document.createElement('div');
      chip.className = 'var-chip';
      chip.title = `式: ${expr} (タップで式に挿入)`;
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
        openHistoryAction(item, index);
      });

      logArea.appendChild(card);
    });

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

  const updateCaretPosition = () => {
    if (document.activeElement === formulaInput) {
      lastSelectionStart = formulaInput.selectionStart ?? formulaInput.value.length;
      lastSelectionEnd = formulaInput.selectionEnd ?? formulaInput.value.length;
    }
  };

  formulaInput.addEventListener('input', () => {
    updateCaretPosition();
    updateLivePreview();
  });
  formulaInput.addEventListener('click', updateCaretPosition);
  formulaInput.addEventListener('keyup', updateCaretPosition);
  formulaInput.addEventListener('select', updateCaretPosition);
  formulaInput.addEventListener('pointerup', updateCaretPosition);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === formulaInput) {
      updateCaretPosition();
    }
  });

  // Prevent tapping variable chips from stealing focus or dropping caret to 0 on Android
  varChipsContainer.addEventListener('pointerdown', (e) => {
    if (!e.target.classList.contains('var-del-btn')) {
      e.preventDefault();
    }
  });

  const insertTextAtCursor = (text) => {
    haptic();
    const current = formulaInput.value;

    // Use active caret if input is focused, otherwise use last tracked position
    let start = (document.activeElement === formulaInput)
      ? (formulaInput.selectionStart ?? lastSelectionStart)
      : lastSelectionStart;
    let end = (document.activeElement === formulaInput)
      ? (formulaInput.selectionEnd ?? lastSelectionEnd)
      : lastSelectionEnd;

    // Clamp within string bounds
    if (typeof start !== 'number' || isNaN(start)) start = current.length;
    if (typeof end !== 'number' || isNaN(end)) end = current.length;
    start = Math.max(0, Math.min(start, current.length));
    end = Math.max(0, Math.min(end, current.length));

    formulaInput.value = current.substring(0, start) + text + current.substring(end);
    const newPos = start + text.length;

    lastSelectionStart = newPos;
    lastSelectionEnd = newPos;

    // Focus with preventScroll to ensure selectionRange is maintained without OS keyboard
    formulaInput.focus({ preventScroll: true });
    formulaInput.setSelectionRange(newPos, newPos);

    updateLivePreview();
  };

  // Smart Parentheses: insert "()" only at the end of input
  const handleOpenParen = () => {
    haptic();
    const current = formulaInput.value;
    let start = (document.activeElement === formulaInput)
      ? (formulaInput.selectionStart ?? lastSelectionStart)
      : lastSelectionStart;
    let end = (document.activeElement === formulaInput)
      ? (formulaInput.selectionEnd ?? lastSelectionEnd)
      : lastSelectionEnd;

    if (start === end && start === current.length) {
      formulaInput.value = current + '()';
      const newPos = start + 1;
      lastSelectionStart = newPos;
      lastSelectionEnd = newPos;
      formulaInput.focus({ preventScroll: true });
      formulaInput.setSelectionRange(newPos, newPos);
    } else {
      insertTextAtCursor('(');
      return;
    }

    updateLivePreview();
  };

  const handleSqrt = () => {
    haptic();
    const current = formulaInput.value;
    let start = (document.activeElement === formulaInput)
      ? (formulaInput.selectionStart ?? lastSelectionStart)
      : lastSelectionStart;
    let end = (document.activeElement === formulaInput)
      ? (formulaInput.selectionEnd ?? lastSelectionEnd)
      : lastSelectionEnd;

    if (start === end && start === current.length) {
      formulaInput.value = current + 'sqrt()';
      const newPos = start + 5;
      lastSelectionStart = newPos;
      lastSelectionEnd = newPos;
      formulaInput.focus({ preventScroll: true });
      formulaInput.setSelectionRange(newPos, newPos);
    } else {
      insertTextAtCursor('sqrt(');
      return;
    }

    updateLivePreview();
  };

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
  // Keypad Touch/Click Routing
  // --------------------------------------------------------------------------
  keypadSection.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.key-btn');
    if (!btn) return;
    if (!isOSKeyboardEnabled) {
      e.preventDefault();
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
        case 'open-paren':
          handleOpenParen();
          break;
        case 'sqrt':
          handleSqrt();
          break;
        case 'backspace':
          performBackspace();
          break;
        case 'history-up':
          navigateHistory('up');
          break;
        case 'history-down':
          navigateHistory('down');
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
      showToast('ソフトウェアキーボード: OFF');
    }
  });

  // --------------------------------------------------------------------------
  // Keyboard Events (PC physical keyboard)
  // --------------------------------------------------------------------------
  formulaInput.addEventListener('keydown', (e) => {
    if (e.key === '(') {
      const start = formulaInput.selectionStart ?? formulaInput.value.length;
      const end = formulaInput.selectionEnd ?? formulaInput.value.length;
      const current = formulaInput.value;
      if (start === end && start === current.length) {
        e.preventDefault();
        formulaInput.value = current + '()';
        const newPos = start + 1;
        formulaInput.setSelectionRange(newPos, newPos);
        updateLivePreview();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (addVarModal.classList.contains('open') || historyActionModal.classList.contains('open') || helpModal.classList.contains('open')) {
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
  // History Item Action Modal & Branching
  // --------------------------------------------------------------------------
  const openHistoryAction = (item, index) => {
    selectedLogItem = item;
    selectedLogIndex = index;
    actionModalExpr.textContent = item.isError 
      ? item.expr 
      : `${item.expr} = ${MathParser.formatNumber(item.result)}`;
    historyActionModal.classList.add('open');
  };

  // Branch Out (枝分かれ)
  actionBranchOut.addEventListener('click', () => {
    if (selectedLogItem && selectedLogIndex >= 0) {
      haptic();
      const active = getActiveSession();
      if (!active) return;

      // Slice history up to the selected item
      const branchHistory = active.historyLogs.slice(0, selectedLogIndex + 1);
      const branchVars = JSON.parse(JSON.stringify(parser.variables));

      // Create branch name
      const baseName = active.name.replace(/\s*\(枝\d*\)$/, '');
      const branchNum = sessions.filter(s => s.name.startsWith(baseName)).length;
      const newTabName = `${baseName} (枝${branchNum})`;

      const branchSession = {
        id: 'session_' + Date.now(),
        name: newTabName,
        variables: branchVars,
        historyLogs: JSON.parse(JSON.stringify(branchHistory))
      };

      sessions.push(branchSession);
      switchSession(branchSession.id);
      closeModals();
      showToast(`"${branchSession.name}" に枝分かれしました`);
    }
  });

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
  // Help Modal
  // --------------------------------------------------------------------------
  openHelpBtn.addEventListener('click', () => {
    haptic();
    helpModal.classList.add('open');
  });

  closeHelpBtn.addEventListener('click', () => {
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
      parser.setVariable(name, valExpr);
      renderVariableChips();
      saveData();
      closeModals();
      showToast(`変数 "${name} = ${valExpr}" を登録しました`);
    } catch (err) {
      alert(`エラー: ${err.message}`);
    }
  });

  const closeModals = () => {
    addVarModal.classList.remove('open');
    historyActionModal.classList.remove('open');
    helpModal.classList.remove('open');
    selectedLogItem = null;
    selectedLogIndex = -1;
  };

  [addVarModal, historyActionModal, helpModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  // --------------------------------------------------------------------------
  // Header Actions
  // --------------------------------------------------------------------------
  exportCsvBtn.addEventListener('click', () => {
    haptic();
    const active = getActiveSession();
    if (!active || active.historyLogs.length === 0) {
      showToast('書き出す履歴がありません');
      return;
    }

    const rows = [
      ['日時', '式', '結果', '種別']
    ];

    active.historyLogs.forEach(item => {
      const dateStr = item.time ? new Date(item.time).toLocaleString('ja-JP') : '';
      const typeStr = item.isAssignment ? '変数定義' : (item.isError ? 'エラー' : '計算');
      rows.push([dateStr, item.expr, String(item.result), typeStr]);
    });

    const csvString = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (active.name || 'session').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `AlternativeCalc_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSVを書き出しました');
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  loadSavedData();
  renderTabs();
  renderVariableChips();
  renderHistory();
});
