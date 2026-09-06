/**
 * MonoPrompt - Application Controller
 * Connects UI, MathParser, LocalStorage, and Touch/Keyboard events.
 */

document.addEventListener('DOMContentLoaded', () => {
  const parser = new MathParser();

  // DOM Elements
  const formulaInput = document.getElementById('formulaInput');
  const previewText = document.getElementById('previewText');
  const previewRow = document.getElementById('previewRow');
  const logArea = document.getElementById('logArea');
  const logEmptyState = document.getElementById('logEmptyState');
  const varChipsContainer = document.getElementById('varChipsContainer');
  const keypadSection = document.getElementById('keypadSection');
  const toggleKeypadBtn = document.getElementById('toggleKeypadBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toastNotice = document.getElementById('toastNotice');

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

  // App State
  let historyLogs = []; // { expr, result, isAssignment, isError, time }
  let historyNavIndex = -1;
  let tempCurrentInput = '';
  let selectedLogItem = null;

  // Haptic feedback for tactile feel
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

  // --------------------------------------------------------------------------
  // LocalStorage Persistence
  // --------------------------------------------------------------------------
  const STORAGE_KEY = 'monoprompt_data_v1';

  const loadSavedData = () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.variables) {
          Object.entries(parsed.variables).forEach(([k, v]) => {
            parser.setVariable(k, v);
          });
        }
        if (Array.isArray(parsed.historyLogs)) {
          historyLogs = parsed.historyLogs;
        }
      }
    } catch (e) {
      console.warn('Failed to load local storage data:', e);
    }
  };

  const saveData = () => {
    try {
      const payload = {
        variables: parser.variables,
        historyLogs: historyLogs.slice(-50) // keep last 50
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save data:', e);
    }
  };

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
    // Clear existing cards
    const existingCards = logArea.querySelectorAll('.log-card');
    existingCards.forEach(card => card.remove());

    if (historyLogs.length === 0) {
      logEmptyState.style.display = 'block';
      return;
    }

    logEmptyState.style.display = 'none';

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

  // Insert text at current cursor position
  const insertTextAtCursor = (text) => {
    haptic();
    const start = formulaInput.selectionStart ?? formulaInput.value.length;
    const end = formulaInput.selectionEnd ?? formulaInput.value.length;
    const current = formulaInput.value;

    formulaInput.value = current.substring(0, start) + text + current.substring(end);
    const newPos = start + text.length;
    formulaInput.focus();
    formulaInput.setSelectionRange(newPos, newPos);

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
    formulaInput.focus();
    updateLivePreview();
  };

  // --------------------------------------------------------------------------
  // Execution (Evaluate)
  // --------------------------------------------------------------------------
  const executeEvaluation = () => {
    haptic();
    const expr = formulaInput.value.trim();
    if (!expr) return;

    try {
      const evalRes = parser.evaluate(expr);
      const logItem = {
        expr: expr,
        result: evalRes.result,
        isAssignment: evalRes.isAssignment,
        isError: false,
        time: Date.now()
      };
      historyLogs.push(logItem);

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
      historyLogs.push(errorLog);
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
          // Use ans if input is empty
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
    const validLogs = historyLogs.filter(item => !item.isError);
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

    formulaInput.focus();
    updateLivePreview();
  };

  // --------------------------------------------------------------------------
  // Keypad Click / Touch Routing
  // --------------------------------------------------------------------------
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
          formulaInput.focus();
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
  // Keyboard Events (PC physical keyboard)
  // --------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    // If modal is open, don't intercept
    if (addVarModal.classList.contains('open') || historyActionModal.classList.contains('open')) {
      if (e.key === 'Escape') {
        closeModals();
      }
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
      formulaInput.focus();
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
      // Evaluate value expression if expression is provided
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

  // Close modals on overlay background click
  [addVarModal, historyActionModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModals();
    });
  });

  // --------------------------------------------------------------------------
  // Header Actions
  // --------------------------------------------------------------------------
  // Toggle keypad
  toggleKeypadBtn.addEventListener('click', () => {
    haptic();
    keypadSection.classList.toggle('collapsed');
    const isCollapsed = keypadSection.classList.contains('collapsed');
    toggleKeypadBtn.style.opacity = isCollapsed ? '0.4' : '1';
  });

  // Clear history
  clearHistoryBtn.addEventListener('click', () => {
    haptic();
    if (historyLogs.length === 0) return;
    if (confirm('計算履歴をすべて消去しますか？')) {
      historyLogs = [];
      saveData();
      renderHistory();
      showToast('履歴を消去しました');
    }
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  loadSavedData();
  renderVariableChips();
  renderHistory();
  formulaInput.focus();
});
