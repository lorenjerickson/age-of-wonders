export const appName = 'Age of Wonders';

export function getPlatformMessage(name: string) {
  return `${appName}: hello ${name}`;
}

export * from './types';
export * from './rules/movement-rule-engine';
