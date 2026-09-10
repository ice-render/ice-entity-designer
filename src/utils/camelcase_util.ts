/**
 * 工具函数，字符串转换成驼峰形式。
 */

function convertToString(input: unknown): string {
  const value = input || '';
  if (typeof value === 'string') return value;
  return String(value);
}

function toWords(input: unknown): string[] {
  const reg = /[A-Z\xC0-\xD6\xD8-\xDE]?[a-z\xDF-\xF6\xF8-\xFF]+|[A-Z\xC0-\xD6\xD8-\xDE]+(?![a-z\xDF-\xF6\xF8-\xFF])|\d+/g;
  return convertToString(input).match(reg) || [];
}

function toCamelCase(inputArray: string[] = [], pascal = false): string {
  let result = '';
  for (let i = 0, len = inputArray.length; i < len; i++) {
    let tempStr = inputArray[i].toLowerCase();
    if (pascal || i !== 0) {
      tempStr = tempStr.substr(0, 1).toUpperCase() + tempStr.substr(1);
    }
    result += tempStr;
  }
  return result;
}

export function camelCase(input: unknown, pascal = false): string {
  return toCamelCase(toWords(input), pascal);
}
