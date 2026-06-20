import * as assert from 'assert';
import {
  tokenize,
  parseGuidsMarkdown,
  isDigit,
  isDigitOrDateChar,
  isBase64Char,
  extractSkobkoObjectRange,
  countDirectChildElementsForOpeningBraces,
  formatWithAlignment,
  formatNormally,
  findFirstGuidInText,
  findGuidOnLine,
  buildOutputExtensionFromProjectFileContent,
  resolveBuildOutputExtension,
  findExistingBuildOutputPath,
  resolveBuildOutputPath,
} from '../src/parser';

describe('tokenize', () => {
  it('should tokenize empty string', () => {
    const tokens = tokenize('');
    assert.strictEqual(tokens.length, 0);
  });

  it('should tokenize braces', () => {
    const tokens = tokenize('{}');
    assert.strictEqual(tokens.length, 2);
    assert.strictEqual(tokens[0].kind, 'lbrace');
    assert.strictEqual(tokens[1].kind, 'rbrace');
  });

  it('should tokenize nested braces', () => {
    const tokens = tokenize('{{}}');
    assert.strictEqual(tokens.length, 4);
    assert.strictEqual(tokens[0].kind, 'lbrace');
    assert.strictEqual(tokens[1].kind, 'lbrace');
    assert.strictEqual(tokens[2].kind, 'rbrace');
    assert.strictEqual(tokens[3].kind, 'rbrace');
  });

  it('should tokenize comma', () => {
    const tokens = tokenize(',');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'comma');
  });

  it('should tokenize whitespace', () => {
    const tokens = tokenize('  \t\n');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'whitespace');
    assert.strictEqual(tokens[0].start, 0);
    assert.strictEqual(tokens[0].end, 4);
  });

  it('should tokenize string', () => {
    const tokens = tokenize('"hello"');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'string');
    assert.strictEqual(tokens[0].start, 0);
    assert.strictEqual(tokens[0].end, 7);
  });

  it('should tokenize string with escaped quote', () => {
    const tokens = tokenize('"hello\\"world"');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'string');
  });

  it('should tokenize string with doubled-quote escapes as one string token', () => {
    const input = '"Some string with ""internal"" quote"';
    const tokens = tokenize(input);
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'string');
    assert.strictEqual(tokens[0].start, 0);
    assert.strictEqual(tokens[0].end, input.length);
  });

  it('should count one direct element for string with internal doubled quotes', () => {
    const text = '{"Some string with ""internal"" quote"}';
    const map = countDirectChildElementsForOpeningBraces(tokenize(text));
    assert.strictEqual(map.get(0), 1);
  });

  it('should tokenize GUID', () => {
    const guid = '12345678-1234-1234-1234-123456789abc';
    const tokens = tokenize(guid);
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'guid');
    assert.strictEqual(tokens[0].start, 0);
    assert.strictEqual(tokens[0].end, 36);
  });

  it('should tokenize uppercase GUID', () => {
    const guid = 'ABCDEF12-3456-7890-ABCD-EF1234567890';
    const tokens = tokenize(guid);
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'guid');
  });

  it('should tokenize number', () => {
    const tokens = tokenize('12345');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'number');
  });

  it('should tokenize negative number', () => {
    const tokens = tokenize('-123');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'number');
  });

  it('should tokenize datetime as 14 digits', () => {
    const tokens = tokenize('20240115103000');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'datetime');
    assert.strictEqual(tokens[0].start, 0);
    assert.strictEqual(tokens[0].end, 14);
  });

  it('should tokenize datetime with leading zeros', () => {
    const tokens = tokenize('00010101000000');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'datetime');
    assert.strictEqual(tokens[0].end, 14);
  });

  it('should tokenize 13 digits as number, not datetime', () => {
    const tokens = tokenize('1234567890123');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'number');
  });

  it('should tokenize 15 digits as number, not datetime', () => {
    const tokens = tokenize('123456789012345');
    assert.strictEqual(tokens.length, 1);
    assert.strictEqual(tokens[0].kind, 'number');
  });

  it('should tokenize complex structure', () => {
    const input = '{"hello", 123, 12345678-1234-1234-1234-123456789abc}';
    const tokens = tokenize(input);
    
    const kinds = tokens.map(t => t.kind);
    assert.deepStrictEqual(kinds, [
      'lbrace',
      'string',
      'comma',
      'whitespace',
      'number',
      'comma',
      'whitespace',
      'guid',
      'rbrace'
    ]);
  });

  it('should preserve correct positions', () => {
    const input = '{1,2}';
    const tokens = tokenize(input);
    
    assert.strictEqual(tokens[0].start, 0); // {
    assert.strictEqual(tokens[0].end, 1);
    assert.strictEqual(tokens[1].start, 1); // 1
    assert.strictEqual(tokens[1].end, 2);
    assert.strictEqual(tokens[2].start, 2); // ,
    assert.strictEqual(tokens[2].end, 3);
    assert.strictEqual(tokens[3].start, 3); // 2
    assert.strictEqual(tokens[3].end, 4);
    assert.strictEqual(tokens[4].start, 4); // }
    assert.strictEqual(tokens[4].end, 5);
  });
});

describe('extractSkobkoObjectRange', () => {
  it('should extract outer object when cursor on first `{`', () => {
    const text = '{{}}';
    const range = extractSkobkoObjectRange(text, 0);
    assert.deepStrictEqual(range, { start: 0, end: 4 });
    assert.strictEqual(text.slice(range!.start, range!.end), '{{}}');
  });

  it('should extract inner object when cursor on nested `{`', () => {
    const text = '{{}}';
    const range = extractSkobkoObjectRange(text, 1);
    assert.deepStrictEqual(range, { start: 1, end: 3 });
    assert.strictEqual(text.slice(range!.start, range!.end), '{}');
  });

  it('should extract inner object when cursor inside nested object', () => {
    const text = '{{}}';
    // позиция на `}` вложенного объекта
    const range = extractSkobkoObjectRange(text, 2);
    assert.deepStrictEqual(range, { start: 1, end: 3 });
    assert.strictEqual(text.slice(range!.start, range!.end), '{}');
  });

  it('should handle deeper nesting', () => {
    const text = '{{{}}}';
    // курсор на `{` третьего уровня
    const range = extractSkobkoObjectRange(text, 2);
    assert.deepStrictEqual(range, { start: 2, end: 4 });
    assert.strictEqual(text.slice(range!.start, range!.end), '{}');
  });

  it('should return undefined when no opening `{` before cursor', () => {
    const text = 'abc';
    const range = extractSkobkoObjectRange(text, 1);
    assert.strictEqual(range, undefined);
  });
});

describe('parseGuidsMarkdown', () => {
  it('should return empty map for empty string', () => {
    const map = parseGuidsMarkdown('');
    assert.strictEqual(map.size, 0);
  });

  it('should parse single GUID entry', () => {
    const markdown = '| 12345678-1234-1234-1234-123456789abc | SomeName |';
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.size, 1);
    assert.strictEqual(map.get('12345678-1234-1234-1234-123456789abc'), 'SomeName');
  });

  it('should parse multiple GUID entries', () => {
    const markdown = `
| GUID | Name |
|------|------|
| 11111111-1111-1111-1111-111111111111 | First |
| 22222222-2222-2222-2222-222222222222 | Second |
`;
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.size, 2);
    assert.strictEqual(map.get('11111111-1111-1111-1111-111111111111'), 'First');
    assert.strictEqual(map.get('22222222-2222-2222-2222-222222222222'), 'Second');
  });

  it('should lowercase GUID keys', () => {
    const markdown = '| ABCDEF12-3456-7890-ABCD-EF1234567890 | Test |';
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.get('abcdef12-3456-7890-abcd-ef1234567890'), 'Test');
  });

  it('should skip lines without pipes', () => {
    const markdown = `
Some text without pipes
| 12345678-1234-1234-1234-123456789abc | ValidName |
Another line
`;
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.size, 1);
  });

  it('should skip invalid GUID format', () => {
    const markdown = '| Name | not-a-valid-guid |';
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.size, 0);
  });

  it('should skip header separator row', () => {
    const markdown = '|------|------|';
    const map = parseGuidsMarkdown(markdown);
    assert.strictEqual(map.size, 0);
  });
});

describe('isDigit', () => {
  it('should return true for digits', () => {
    for (let i = 0; i <= 9; i++) {
      assert.strictEqual(isDigit(String(i)), true, `Failed for ${i}`);
    }
  });

  it('should return false for non-digits', () => {
    assert.strictEqual(isDigit('a'), false);
    assert.strictEqual(isDigit('Z'), false);
    assert.strictEqual(isDigit('-'), false);
    assert.strictEqual(isDigit(' '), false);
  });
});

describe('isDigitOrDateChar', () => {
  it('should return true for digits', () => {
    for (let i = 0; i <= 9; i++) {
      assert.strictEqual(isDigitOrDateChar(String(i)), true, `Failed for ${i}`);
    }
  });

  it('should return false for non-digits', () => {
    assert.strictEqual(isDigitOrDateChar('-'), false);
    assert.strictEqual(isDigitOrDateChar(':'), false);
    assert.strictEqual(isDigitOrDateChar('T'), false);
    assert.strictEqual(isDigitOrDateChar('Z'), false);
    assert.strictEqual(isDigitOrDateChar('.'), false);
    assert.strictEqual(isDigitOrDateChar('+'), false);
    assert.strictEqual(isDigitOrDateChar('/'), false);
    assert.strictEqual(isDigitOrDateChar('a'), false);
    assert.strictEqual(isDigitOrDateChar(' '), false);
  });
});

describe('isBase64Char', () => {
  it('should return true for uppercase letters', () => {
    assert.strictEqual(isBase64Char('A'), true);
    assert.strictEqual(isBase64Char('Z'), true);
  });

  it('should return true for lowercase letters', () => {
    assert.strictEqual(isBase64Char('a'), true);
    assert.strictEqual(isBase64Char('z'), true);
  });

  it('should return true for digits', () => {
    assert.strictEqual(isBase64Char('0'), true);
    assert.strictEqual(isBase64Char('9'), true);
  });

  it('should return true for base64 special chars', () => {
    assert.strictEqual(isBase64Char('+'), true);
    assert.strictEqual(isBase64Char('/'), true);
    assert.strictEqual(isBase64Char('='), true);
  });

  it('should return false for other chars', () => {
    assert.strictEqual(isBase64Char('-'), false);
    assert.strictEqual(isBase64Char(' '), false);
    assert.strictEqual(isBase64Char('@'), false);
  });
});

describe('countDirectChildElementsForOpeningBraces', () => {
  it('should return empty map for input without braces', () => {
    const tokens = tokenize('abc');
    const map = countDirectChildElementsForOpeningBraces(tokens);
    assert.strictEqual(map.size, 0);
  });

  it('should count empty braces', () => {
    const map = countDirectChildElementsForOpeningBraces(tokenize('{}'));
    assert.strictEqual(map.size, 1);
    assert.strictEqual(map.get(0), 0);
  });

  it('should count nested braces non-recursively', () => {
    const text = '{{}}';
    const map = countDirectChildElementsForOpeningBraces(tokenize(text));
    assert.strictEqual(map.get(0), 1); // outer contains inner object as one direct element
    assert.strictEqual(map.get(1), 0); // inner contains no elements
  });

  it('should count primitive elements', () => {
    const map = countDirectChildElementsForOpeningBraces(tokenize('{1,2}'));
    assert.strictEqual(map.get(0), 2);
  });

  it('should count direct children mixed with nested objects', () => {
    const text = '{"x",{1},{2,3}}';
    const map = countDirectChildElementsForOpeningBraces(tokenize(text));

    const bracePositions: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        bracePositions.push(i);
      }
    }

    assert.deepStrictEqual(bracePositions, [0, 5, 9]);
    assert.strictEqual(map.get(bracePositions[0]), 3); // "x", {1}, {2,3}
    assert.strictEqual(map.get(bracePositions[1]), 1); // {1}
    assert.strictEqual(map.get(bracePositions[2]), 2); // {2,3}
  });

  it('should ignore trailing comma', () => {
    const map = countDirectChildElementsForOpeningBraces(tokenize('{1,}'));
    assert.strictEqual(map.get(0), 1);
  });

  it('should count elements across whitespace', () => {
    const map = countDirectChildElementsForOpeningBraces(tokenize('{ 1 , {2} , 3 }'));
    assert.strictEqual(map.get(0), 3);
  });
});

describe('formatWithAlignment', () => {
  it('should put each value on separate line with indentation', () => {
    const input = '{1,{2,3},4}';
    const result = formatWithAlignment(input);
    const expected = ['{', '  1,', '  {', '    2,', '    3', '  },', '  4', '}'].join('\n');
    assert.strictEqual(result, expected);
  });

  it('should keep single-value object in one line', () => {
    const input = '{1}';
    const result = formatWithAlignment(input);
    assert.strictEqual(result, '{ 1 }');
  });

  it('should keep nested single-value objects inline', () => {
    const input = '{{1}}';
    const result = formatWithAlignment(input);
    assert.strictEqual(result, '{ { 1 } }');
  });
});

describe('formatNormally', () => {
  it('should not insert space after commas', () => {
    const input = '{1,2,3}';
    const result = formatNormally(input);
    assert.strictEqual(result, '{1,2,3}');
  });

  it('should place each opening brace on a new line', () => {
    const input = '{{1,2}}';
    const result = formatNormally(input);
    assert.strictEqual(result, '{\n{1,2}\n}');
  });

  it('should add newline between consecutive closing braces', () => {
    const input = '{{1}}';
    const result = formatNormally(input);
    assert.strictEqual(result, '{\n{1}\n}');
  });

  it('should preserve newlines inside multiline strings', () => {
    const input = '{"line1\nline2"}';
    const result = formatNormally(input);
    assert.strictEqual(result, '{"line1\nline2"}');
  });
});

describe('build output extension', () => {
  it('should find first guid in root file', () => {
    const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    assert.strictEqual(findFirstGuidInText(`{${guid}, "meta"}`), guid);
  });

  it('should find guid on third line of project file', () => {
    const typeGuid = '9cd510cd-abfc-11d4-9434-004095e12fc7';
    const content = `{\n"line2"\n${typeGuid}\n"line4"`;
    assert.strictEqual(findGuidOnLine(content, 3), typeGuid);
  });

  it('should map project type guid to output extension', () => {
    const content = `{\n"line2"\n9cd510cd-abfc-11d4-9434-004095e12fc7\n"line4"`;
    assert.strictEqual(buildOutputExtensionFromProjectFileContent(content), 'cf');

    const erfContent = `{\n"line2"\ne41aff26-25cf-4bb6-b6c1-3f478a75f374\n"line4"`;
    assert.strictEqual(buildOutputExtensionFromProjectFileContent(erfContent), 'erf');

    const epfContent = `{\n"line2"\nc3831ec8-d8d5-4f93-8a22-f9bfae07327f\n"line4"`;
    assert.strictEqual(buildOutputExtensionFromProjectFileContent(epfContent), 'epf');
  });

  it('should resolve cfe when configinfo exists without root', () => {
    assert.strictEqual(
      resolveBuildOutputExtension({ hasConfigInfoFile: true }),
      'cfe',
    );
  });

  it('should resolve extension from root and project file', () => {
    const typeGuid = 'c3831ec8-d8d5-4f93-8a22-f9bfae07327f';
    const projectContent = `{\n"line2"\n${typeGuid}\n"line4"`;
    assert.strictEqual(
      resolveBuildOutputExtension({
        rootFileContent: '{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}',
        projectFileContent: projectContent,
        hasConfigInfoFile: false,
      }),
      'epf',
    );
  });

  it('should not fall back to cfe when root exists but project type is unknown', () => {
    assert.strictEqual(
      resolveBuildOutputExtension({
        rootFileContent: '{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}',
        projectFileContent: '{\n"line2"\nunknown-guid\n"line4"',
        hasConfigInfoFile: true,
      }),
      undefined,
    );
  });

  it('should find existing build output file when extension is unknown', () => {
    const projectPath = 'C:\\Project\\Skobko';

    assert.strictEqual(
      findExistingBuildOutputPath(projectPath, ['Skobko.erf']),
      'C:\\Project\\Skobko.erf',
    );
  });

  it('should find existing build output file with arbitrary extension', () => {
    const projectPath = 'C:\\Project\\Skobko';

    assert.strictEqual(
      findExistingBuildOutputPath(projectPath, ['Skobko.custom']),
      'C:\\Project\\Skobko.custom',
    );
  });

  it('should prefer detected extension over existing file', () => {
    const projectPath = 'C:\\Project\\Skobko';

    assert.strictEqual(
      resolveBuildOutputPath(projectPath, 'cf', ['Skobko.erf']),
      `${projectPath}.cf`,
    );
  });

  it('should fall back to existing build output file', () => {
    const projectPath = 'C:\\Project\\Skobko';

    assert.strictEqual(
      resolveBuildOutputPath(projectPath, undefined, ['Skobko.epf']),
      `${projectPath}.epf`,
    );
  });
});
