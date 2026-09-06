/**
 * AlternativeCalc - Reactive Expression & AST Parser
 * Features:
 * - Reactive Variables: Updating a base variable automatically recalculates dependent variables.
 *   (e.g., taxA = 1.1 -> taxB = taxA -> taxA = 1.08 updates taxB to 1.08)
 * - Safe AST Parser without eval() or new Function().
 * - Precision float rounding.
 */

class MathParser {
  constructor() {
    // variables map: name -> { expr: string, value: number }
    this.variables = {};
    this.ans = 0;
  }

  // Floating point precision correction (fixes 0.1 + 0.2 = 0.30000000000000004)
  cleanFloat(num) {
    if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) return num;
    const rounded = parseFloat(num.toPrecision(14));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  // Format number for display with commas
  static formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) {
      return String(num);
    }
    const parts = String(num).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  // Set or update a variable with an expression string
  setVariable(name, exprStr) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`不正な変数名です: "${name}"`);
    }
    if (name === 'ans') {
      throw new Error(`"ans" は予約語のため変数名として使用できません`);
    }

    const cleanExpr = String(exprStr).trim();
    // Temporarily store expression and calculate
    this.variables[name] = {
      expr: cleanExpr,
      value: 0
    };

    // Recalculate all variables to resolve reactive dependencies
    this.recalculateAll();
    return this.variables[name].value;
  }

  getVariable(name) {
    if (name === 'ans') {
      return this.ans;
    }
    if (name in this.variables) {
      return this.variables[name].value;
    }
    throw new Error(`未定義の変数です: "${name}"`);
  }

  removeVariable(name) {
    const deleted = delete this.variables[name];
    if (deleted) {
      this.recalculateAll();
    }
    return deleted;
  }

  getVariablesList() {
    return Object.entries(this.variables).map(([name, data]) => ({
      name,
      expr: data.expr,
      value: data.value
    }));
  }

  /**
   * Reactive recalculation: updates all variable values based on their expressions.
   * Handles multi-hop dependencies (e.g. taxB = taxA, taxC = taxB * 2).
   */
  recalculateAll() {
    const varNames = Object.keys(this.variables);
    if (varNames.length === 0) return;

    // Iterative convergence evaluation (up to iterations = var count + 1)
    for (let iter = 0; iter < varNames.length + 1; iter++) {
      let anyChanged = false;

      for (const name of varNames) {
        const item = this.variables[name];
        try {
          // Evaluate item's expression using current state
          const tokens = this.tokenize(item.expr);
          let idx = 0;
          const peek = () => tokens[idx];
          const consume = () => tokens[idx++];
          const val = this.cleanFloat(this.parseExpression(tokens, peek, consume));
          
          if (val !== item.value) {
            item.value = val;
            anyChanged = true;
          }
        } catch (e) {
          // If expression fails (e.g. references not yet defined), retain or set NaN
          item.value = isNaN(item.value) ? 0 : item.value;
        }
      }

      if (!anyChanged) break; // Converged
    }
  }

  // Tokenize input string
  tokenize(expr) {
    const tokens = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const ch = expr[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] || ''))) {
        let numStr = '';
        let hasDot = false;
        while (i < len && (/[0-9]/.test(expr[i]) || (expr[i] === '.' && !hasDot))) {
          if (expr[i] === '.') hasDot = true;
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Identifiers
      if (/[a-zA-Z_]/.test(ch)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
          ident += expr[i];
          i++;
        }
        tokens.push({ type: 'IDENT', value: ident });
        continue;
      }

      // Operators and Symbols
      if ('+-*/%^=()'.includes(ch)) {
        if (ch === '*' && expr[i + 1] === '*') {
          tokens.push({ type: 'OP', value: '^' });
          i += 2;
          continue;
        }
        tokens.push({
          type: ch === '=' ? 'ASSIGN' : ('()'.includes(ch) ? (ch === '(' ? 'LPAREN' : 'RPAREN') : 'OP'),
          value: ch
        });
        i++;
        continue;
      }

      if (ch === '×') {
        tokens.push({ type: 'OP', value: '*' });
        i++;
        continue;
      }
      if (ch === '÷') {
        tokens.push({ type: 'OP', value: '/' });
        i++;
        continue;
      }
      if (ch === '−') {
        tokens.push({ type: 'OP', value: '-' });
        i++;
        continue;
      }

      throw new Error(`認識できない文字があります: "${ch}"`);
    }

    tokens.push({ type: 'EOF', value: null });
    return tokens;
  }

  /**
   * Evaluate expression or assignment
   * Assignment example: taxA = 1.1, taxB = taxA
   */
  evaluate(inputStr) {
    const trimmed = inputStr.trim();
    if (!trimmed) {
      return { isAssignment: false, result: 0 };
    }

    const tokens = this.tokenize(trimmed);

    // Assignment: IDENT '=' Expression
    if (tokens.length >= 3 && tokens[0].type === 'IDENT' && tokens[1].type === 'ASSIGN') {
      const varName = tokens[0].value;
      const exprPart = trimmed.substring(trimmed.indexOf('=') + 1).trim();

      const finalVal = this.setVariable(varName, exprPart);
      this.ans = finalVal;
      return { isAssignment: true, name: varName, expr: exprPart, result: finalVal };
    }

    // Standard Math Expression
    let index = 0;
    const peek = () => tokens[index];
    const consume = () => tokens[index++];

    const value = this.parseExpression(tokens, peek, consume);
    if (tokens[index].type !== 'EOF') {
      throw new Error(`式の後に余分な文字があります: "${tokens[index].value}"`);
    }
    const finalVal = this.cleanFloat(value);
    this.ans = finalVal;
    return { isAssignment: false, result: finalVal };
  }

  parseExpression(tokens, peek, consume) {
    let left = this.parseTerm(tokens, peek, consume);

    while (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const right = this.parseTerm(tokens, peek, consume);
      if (op === '+') {
        left = this.cleanFloat(left + right);
      } else {
        left = this.cleanFloat(left - right);
      }
    }
    return left;
  }

  parseTerm(tokens, peek, consume) {
    let left = this.parsePower(tokens, peek, consume);

    while (peek().type === 'OP' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = consume().value;
      const right = this.parsePower(tokens, peek, consume);
      if (op === '*') {
        left = this.cleanFloat(left * right);
      } else if (op === '/') {
        if (right === 0) {
          throw new Error('ゼロ除算エラー: 0 で割ることはできません');
        }
        left = this.cleanFloat(left / right);
      } else if (op === '%') {
        if (right === 0) {
          throw new Error('ゼロ除算エラー: 0 で剰余を求めることはできません');
        }
        left = this.cleanFloat(left % right);
      }
    }
    return left;
  }

  parsePower(tokens, peek, consume) {
    const left = this.parseUnary(tokens, peek, consume);

    if (peek().type === 'OP' && peek().value === '^') {
      consume();
      const right = this.parsePower(tokens, peek, consume);
      return this.cleanFloat(Math.pow(left, right));
    }
    return left;
  }

  parseUnary(tokens, peek, consume) {
    if (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const factor = this.parseUnary(tokens, peek, consume);
      return op === '-' ? this.cleanFloat(-factor) : factor;
    }
    return this.parsePrimary(tokens, peek, consume);
  }

  parsePrimary(tokens, peek, consume) {
    const tok = peek();

    if (tok.type === 'NUMBER') {
      consume();
      return tok.value;
    }

    if (tok.type === 'IDENT') {
      const name = consume().value;
      if (peek().type === 'LPAREN') {
        consume(); // LPAREN
        const arg = this.parseExpression(tokens, peek, consume);
        if (peek().type !== 'RPAREN') {
          throw new Error('閉じ括弧 ")" が不足しています');
        }
        consume(); // RPAREN
        switch (name.toLowerCase()) {
          case 'sqrt':
            if (arg < 0) throw new Error('負の数の平方根は計算できません');
            return this.cleanFloat(Math.sqrt(arg));
          case 'abs':
            return this.cleanFloat(Math.abs(arg));
          case 'round':
            return this.cleanFloat(Math.round(arg));
          case 'ceil':
            return this.cleanFloat(Math.ceil(arg));
          case 'floor':
            return this.cleanFloat(Math.floor(arg));
          default:
            throw new Error(`未知の関数です: "${name}()"`);
        }
      }
      return this.getVariable(name);
    }

    if (tok.type === 'LPAREN') {
      consume();
      const val = this.parseExpression(tokens, peek, consume);
      if (peek().type !== 'RPAREN') {
        throw new Error('閉じ括弧 ")" が不足しています');
      }
      consume();
      return val;
    }

    if (tok.type === 'EOF') {
      throw new Error('式が途中で終了しています');
    }

    throw new Error(`不正な構文です: "${tok.value ?? tok.type}"`);
  }

  preview(inputStr) {
    try {
      const trimmed = inputStr.trim();
      if (!trimmed) return null;

      if (/[+\-*/%^(=]$/.test(trimmed)) {
        return null;
      }

      let openParen = 0;
      for (const ch of trimmed) {
        if (ch === '(') openParen++;
        if (ch === ')') openParen--;
        if (openParen < 0) return null;
      }
      if (openParen !== 0) return null;

      // Temporary clone to test preview
      const clone = new MathParser();
      clone.variables = JSON.parse(JSON.stringify(this.variables));
      clone.ans = this.ans;
      const res = clone.evaluate(trimmed);
      return res.result;
    } catch {
      return null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathParser;
}
