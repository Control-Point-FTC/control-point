/** Unit tests for the CAD section's pure helpers (server/cad.ts). */
import { describe, it, expect } from 'vitest';
import {
  normalizeSection,
  isValidReviewStatus,
  isValidPartSource,
  isValidPartStatus,
  detectModelType,
  isValidHttpUrl,
  canTransitionReviewStatus,
  sanitizePartInput,
} from '../../../../server/cad';

describe('normalizeSection', () => {
  it('matches known sections case-insensitively', () => {
    expect(normalizeSection('intake')).toBe('Intake');
    expect(normalizeSection('DRIVETRAIN')).toBe('Drivetrain');
    expect(normalizeSection('End Game')).toBe('End Game');
  });
  it('falls back to Other for unknown/empty input', () => {
    expect(normalizeSection('wings')).toBe('Other');
    expect(normalizeSection('')).toBe('Other');
    expect(normalizeSection(undefined)).toBe('Other');
  });
});

describe('status/source validators', () => {
  it('accepts only known review statuses', () => {
    expect(isValidReviewStatus('in_review')).toBe(true);
    expect(isValidReviewStatus('shipped')).toBe(false);
  });
  it('accepts only known part sources and statuses', () => {
    expect(isValidPartSource('gobilda')).toBe(true);
    expect(isValidPartSource('amazon')).toBe(false);
    expect(isValidPartStatus('installed')).toBe(true);
    expect(isValidPartStatus('lost')).toBe(false);
  });
});

describe('detectModelType', () => {
  it('detects STEP variants', () => {
    expect(detectModelType('intake.step')).toBe('step');
    expect(detectModelType('INTAKE.STP')).toBe('step');
  });
  it('detects STL', () => {
    expect(detectModelType('bracket.stl')).toBe('stl');
  });
  it('rejects anything else', () => {
    expect(detectModelType('photo.png')).toBe(null);
    expect(detectModelType('model.obj')).toBe(null);
    expect(detectModelType(undefined)).toBe(null);
  });
});

describe('isValidHttpUrl', () => {
  it('accepts http/https Onshape links', () => {
    expect(isValidHttpUrl('https://cad.onshape.com/documents/abc')).toBe(true);
  });
  it('rejects junk', () => {
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('ftp://x.com/f')).toBe(false);
  });
});

describe('canTransitionReviewStatus', () => {
  it('lets the author submit a concept for review', () => {
    expect(canTransitionReviewStatus({ from: 'concept', to: 'in_review', isAdmin: false, isAuthor: true })).toBe(true);
  });
  it('lets the author re-submit after changes were requested', () => {
    expect(canTransitionReviewStatus({ from: 'changes_requested', to: 'in_review', isAdmin: false, isAuthor: true })).toBe(true);
  });
  it('blocks members from approving', () => {
    expect(canTransitionReviewStatus({ from: 'in_review', to: 'approved', isAdmin: false, isAuthor: true })).toBe(false);
  });
  it('blocks non-authors from touching the pipeline', () => {
    expect(canTransitionReviewStatus({ from: 'concept', to: 'in_review', isAdmin: false, isAuthor: false })).toBe(false);
  });
  it('lets admins move reviews through the pipeline', () => {
    expect(canTransitionReviewStatus({ from: 'in_review', to: 'approved', isAdmin: true, isAuthor: false })).toBe(true);
    expect(canTransitionReviewStatus({ from: 'in_review', to: 'changes_requested', isAdmin: true, isAuthor: false })).toBe(true);
    expect(canTransitionReviewStatus({ from: 'approved', to: 'built', isAdmin: true, isAuthor: false })).toBe(true);
  });
  it('keeps "built" terminal even for admins', () => {
    expect(canTransitionReviewStatus({ from: 'built', to: 'in_review', isAdmin: true, isAuthor: true })).toBe(false);
  });
  it('rejects no-op and unknown transitions', () => {
    expect(canTransitionReviewStatus({ from: 'concept', to: 'concept', isAdmin: true, isAuthor: true })).toBe(false);
    expect(canTransitionReviewStatus({ from: 'concept', to: 'nope' as any, isAdmin: true, isAuthor: true })).toBe(false);
  });
});

describe('sanitizePartInput', () => {
  it('requires a name', () => {
    expect(sanitizePartInput({}).ok).toBe(false);
    expect(sanitizePartInput({ name: '  ' }).ok).toBe(false);
  });
  it('normalizes a full payload', () => {
    const r = sanitizePartInput({ name: '  Omni wheel ', section: 'drivetrain', quantity: '4', source: 'gobilda', unit_cost: '12.5', status: 'ordered', assignee: ' Sam ', notes: 'x' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ name: 'Omni wheel', section: 'Drivetrain', quantity: 4, source: 'gobilda', unit_cost: 12.5, status: 'ordered', assignee: 'Sam' });
  });
  it('clamps bad numbers and falls back on bad enums', () => {
    const r = sanitizePartInput({ name: 'Screw', quantity: -3, unit_cost: 'abc', source: 'mars', status: 'vapor' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ quantity: 1, unit_cost: 0, source: 'purchased', status: 'to_order' });
  });
});
