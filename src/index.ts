import joplin from 'api';
import { ContentScriptType, SettingItemType } from 'api/types';

const CONTENT_SCRIPT_ID = 'com.github.psark007.live-math-joplin.cm6';
const SETTINGS_SECTION = 'joplinLiveMath';
const ENABLE_LIVE_MATH_SETTING = 'enableLiveMath';

const readSettings = async () => ({
	enableLiveMath: (await joplin.settings.value(ENABLE_LIVE_MATH_SETTING)) !== false,
});

const updateEditorSetting = async () => {
	try {
		const settings = await readSettings();
		await joplin.commands.execute('editor.execCommand', {
			name: 'joplinLiveMath.setEnabled',
			args: [settings.enableLiveMath],
		});
	} catch (error) {
		// The editor command is unavailable until a CM6 editor has loaded.
		console.info('Joplin Live Math: deferred editor setting update', error);
	}
};

const registerSettings = async () => {
	await joplin.settings.registerSection(SETTINGS_SECTION, {
		label: 'Joplin Live Math',
		description: 'Render LaTeX math in the Markdown editor when the expression is not being edited.',
		iconName: 'fas fa-square-root-alt',
	});

	await joplin.settings.registerSettings({
		[ENABLE_LIVE_MATH_SETTING]: {
			value: true,
			type: SettingItemType.Bool,
			public: true,
			section: SETTINGS_SECTION,
			label: 'Enable Live Math',
			description: 'Render $...$ and $$...$$ math inside the CodeMirror 6 Markdown editor.',
		},
	});
};

joplin.plugins.register({
	onStart: async () => {
		await registerSettings();

		await joplin.contentScripts.onMessage(CONTENT_SCRIPT_ID, async (message: unknown) => {
			if (message === 'getSettings') {
				return readSettings();
			}

			return undefined;
		});

		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			CONTENT_SCRIPT_ID,
			'./contentScript.js'
		);

		await joplin.settings.onChange(async event => {
			if (event.keys.includes(ENABLE_LIVE_MATH_SETTING)) {
				await updateEditorSetting();
			}
		});

		await updateEditorSetting();
	},
});
