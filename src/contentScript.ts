import { Compartment, type Extension, type StateEffect } from '@codemirror/state';
import {
	liveMathClickHandler,
	liveMathEnabledFacet,
	liveMathLoadedAttribute,
	mathDecorationsField,
} from './mathDecorations';

interface ContentScriptContext {
	contentScriptId: string;
	postMessage: (message: unknown) => Promise<unknown>;
}

interface CodeMirrorWrapper {
	cm6: {
		dispatch: (transaction: { effects: StateEffect<unknown> }) => void;
	};
	addExtension: (extension: Extension) => void;
	registerCommand?: (name: string, callback: (enabled: boolean) => void) => void;
}

interface LiveMathSettings {
	enableLiveMath: boolean;
}

const getInitialSettings = async (context: ContentScriptContext): Promise<LiveMathSettings> => {
	try {
		const settings = await context.postMessage('getSettings');
		if (settings && typeof settings === 'object' && 'enableLiveMath' in settings) {
			return { enableLiveMath: (settings as LiveMathSettings).enableLiveMath !== false };
		}
	} catch (error) {
		console.warn('Joplin-Live-Math: failed to read settings; enabling by default', error);
	}

	return { enableLiveMath: true };
};

export default (context: ContentScriptContext) => ({
	plugin: (codeMirrorWrapper: CodeMirrorWrapper) => {
		if (!codeMirrorWrapper.cm6) {
			return;
		}

		const extensionForSetting = (enabled: boolean): Extension => {
			if (!enabled) {
				return [liveMathLoadedAttribute, liveMathEnabledFacet.of(false)];
			}

			return [liveMathLoadedAttribute, liveMathEnabledFacet.of(true), liveMathClickHandler, mathDecorationsField];
		};

		const liveMathCompartment = new Compartment();
		codeMirrorWrapper.addExtension(liveMathCompartment.of(extensionForSetting(true)));

		const reconfigure = (enabled: boolean) => {
			codeMirrorWrapper.cm6.dispatch({
				effects: liveMathCompartment.reconfigure(extensionForSetting(enabled)),
			});
		};

		if (typeof codeMirrorWrapper.registerCommand === 'function') {
			codeMirrorWrapper.registerCommand('joplinLiveMath.setEnabled', (enabled: boolean) => {
				reconfigure(enabled !== false);
			});
		}

		void getInitialSettings(context)
			.then(settings => {
				reconfigure(settings.enableLiveMath);
			})
			.catch(error => {
				console.warn('Joplin-Live-Math: failed to apply settings after loading', error);
			});

		console.info('Joplin-Live-Math: CodeMirror 6 extension loaded');
	},

	assets: () => [
		{ name: './styles.css' },
		{ name: './katex.min.css' },
	],
});
