/**
 * MonoPrompt - Expression & AST Parser Engine
 * Safe recursive-descent math parser without eval() or new Function().
 * Supports variables, assignment, parentheses, unary operators, and float correction.
 */

class MathParser {
  constructor() {
    this.variables = {
      ans: 0,
      M: 0
    };
  }

  // Set or update a variable
  setVariable(name, value) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`不正な変数名です: "${name}"`);
    }
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error(`無効な数値です: "${value}"`);
    }
    this.variables[name] = this.cleanFloat(num);
    return this.variables[name];
  }

  getVariable(name) {
    if (name in this.variables) {
      return this.variables[name];
    }
    throw new Error(`未定義の変数です: "${name}"`);
  }

  removeVariable(name) {
    if (name === 'ans' || name === 'M') {
      this.variables[name] = 0;
      return true;
    }
    return delete this.variables[name];
  }

  getVariablesList() {
    return Object.entries(this.variables)
      .filter(([k]) => k !== 'ans')
      .map(([name, value]) => ({ name, value }));
  }

  // Floating point precision correction (fixes 0.1 + 0.2 = 0.30000000000000004)
  cleanFloat(num) {
    if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) return num;
    // 14 significant digits to prevent rounding errors
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

  // Tokenize input string
  tokenize(expr) {
    const tokens = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const ch = expr[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers (integer or decimal)
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

      // Identifiers (variable names)
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
        // Multi-char operators (e.g. ** for power)
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

      // Support common Unicode math symbols
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
   * Parse & evaluate an expression string.
   * Handles:
   * 1. Variable Assignment: name = expression
   * 2. Math Expression: 1122 * (4.75 + 4570) + 2500 + 2500
   * @returns {{ isAssignment: boolean, name?: string, result: number }}
   */
  evaluate(inputStr) {
    const trimmed = inputStr.trim();
    if (!trimmed) {
      return { isAssignment: false, result: 0 };
    }

    const tokens = this.tokenize(trimmed);
    let index = 0;

    const peek = () => tokens[index];
    const consume = (expectedType, expectedValue) => {
      const tok = tokens[index];
      if (expectedType && tok.type !== expectedType) {
        throw new Error(`構文エラー: "${tok.value ?? tok.type}" は予期しないトークンです (期待値: ${expectedType})`);
      }
      if (expectedValue && tok.value !== expectedValue) {
        throw new Error(`構文エラー: "${tok.value}" は予期しない値です (期待値: ${expectedValue})`);
      }
      index++;
      return tok;
    };

    // Check for assignment: IDENT ASSIGN Expression
    if (tokens.length >= 3 && tokens[0].type === 'IDENT' && tokens[1].type === 'ASSIGN') {
      const varName = tokens[0].value;
      index = 2; // skip IDENT and ASSIGN
      const value = this.parseExpression(tokens, () => tokens[index], () => consume());
      if (tokens[index].type !== 'EOF') {
        throw new Error(`式の後に余分な文字があります: "${tokens[index].value}"`);
      }
      const finalVal = this.cleanFloat(value);
      this.setVariable(varName, finalVal);
      this.variables.ans = finalVal;
      return { isAssignment: true, name: varName, result: finalVal };
    }

    // Standard Math Expression
    const value = this.parseExpression(tokens, () => tokens[index], () => consume());
    if (tokens[index].type !== 'EOF') {
      throw new Error(`式の後に余分な文字があります: "${tokens[index].value}"`);
    }
    const finalVal = this.cleanFloat(value);
    this.variables.ans = finalVal;
    return { isAssignment: false, result: finalVal };
  }

  // Parse Expression: Addition and Subtraction
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

  // Parse Term: Multiplication, Division, Modulo
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

  // Parse Power: Base ^ Exponent (right-associative)
  parsePower(tokens, peek, consume) {
    const left = this.parseUnary(tokens, peek, consume);

    if (peek().type === 'OP' && peek().value === '^') {
      consume();
      const right = this.parsePower(tokens, peek, consume); // right-associative recursion
      return this.cleanFloat(Math.pow(left, right));
    }
    return left;
  }

  // Parse Unary: + or -
  parseUnary(tokens, peek, consume) {
    if (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value;
      const factor = this.parseUnary(tokens, peek, consume);
      return op === '-' ? this.cleanFloat(-factor) : factor;
    }
    return this.parsePrimary(tokens, peek, consume);
  }

  // Parse Primary: Number, Identifier, Parentheses, Functions
  parsePrimary(tokens, peek, consume) {
    const tok = peek();

    if (tok.type === 'NUMBER') {
      consume();
      return tok.value;
    }

    if (tok.type === 'IDENT') {
      const name = consume().value;
      // Check for built-in math functions: sqrt(x), abs(x), round(x), ceil(x), floor(x)
      if (peek().type === 'LPAREN') {
        consume('LPAREN');
        const arg = this.parseExpression(tokens, peek, consume);
        consume('RPAREN');
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
      consume('LPAREN');
      const val = this.parseExpression(tokens, peek, consume);
      if (peek().type !== 'RPAREN') {
        throw new Error('閉じ括弧 ")" が不足しています');
      }
      consume('RPAREN');
      return val;
    }

    if (tok.type === 'EOF') {
      throw new Error('式が途中で終了しています');
    }

    throw new Error(`不正な構文です: "${tok.value ?? tok.type}"`);
  }

  /**
   * Safe preview evaluation. Does not throw errors or update state (ans/vars).
   * Used for real-time live preview while typing.
   */
  preview(inputStr) {
    try {
      const trimmed = inputStr.trim();
      if (!trimmed) return null;

      // Don't evaluate incomplete trailing operators in preview
      if (/[+\-*/%^(=]$/.test(trimmed)) {
        return null;
      }

      // Check unbalanced parentheses
      let openParen = 0;
      for (const ch of trimmed) {
        if (ch === '(') openParen++;
        if (ch === ')') openParen--;
        if (openParen < 0) return null;
      }
      if (openParen !== 0) return null;

      // Clone vars for preview
      const clone = new MathParser();
      clone.variables = { ...this.variables };
      const res = clone.evaluate(trimmed);
      return res.result;
    } catch {
      return null;
    }
  }
}

// Export for module/Node or browser window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathParser;
}
