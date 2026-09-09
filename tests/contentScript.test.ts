import { EditorState, StateEffect } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import contentScript from '../src/contentScript';
import { liveMathEnabledFacet } from '../src/mathDecorations';

describe('content script settings', () => {
	it('does not overwrite a newer setting with a delayed startup response', async () => {
		let resolveSettings!: (settings: { enableLiveMath: boolean }) => void;
		const settings = new Promise<{ enableLiveMath: boolean }>(resolve => { resolveSettings = resolve; });
		let state = EditorState.create({ doc: '$x$' });
		let setEnabled!: (enabled: boolean) => void;
		contentScript({ contentScriptId: 'test', postMessage: () => settings }).plugin({
			cm6: { dispatch: transaction => { state = state.update(transaction).state; } },
			addExtension: extension => { state = state.update({ effects: StateEffect.appendConfig.of(extension) }).state; },
			registerCommand: (_name, callback) => { setEnabled = callback; },
		});
		setEnabled(false);
		resolveSettings({ enableLiveMath: true });
		await settings;
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(state.facet(liveMathEnabledFacet)).toBe(false);
	});

	it('applies a saved disabled setting when no newer command arrives', async () => {
		let state = EditorState.create({ doc: '$x$' });
		contentScript({ contentScriptId: 'test', postMessage: async () => ({ enableLiveMath: false }) }).plugin({
			cm6: { dispatch: transaction => { state = state.update(transaction).state; } },
			addExtension: extension => { state = state.update({ effects: StateEffect.appendConfig.of(extension) }).state; },
		});
		await vi.waitFor(() => expect(state.facet(liveMathEnabledFacet)).toBe(false));
	});
});
