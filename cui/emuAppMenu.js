class CuiState {

	async onAction(act) {
		if (act == 'install') {
			let res = await this.installEmuApp();
			if (!res) return;
			// 'Success!' 'Installed'
			cui.alert(lang.emuAppMenu_6.msg11 + ' ' +
				prefs[emu].name, lang.alertMenu_9999.title0,
				'doubleBack');
		} else if (act == 'find') {
			// 'Select emulator app'
			let emuApp = await dialog.selectFile(
				lang.playing_4.msg0);
			if (mac) {
				emuApp = await nostlan.launcher.getMacExec(emuApp);
			}
			if (!(await fs.exists(emuApp))) {
				// 'Emulator app not found at'
				cui.err(lang.playing_4.err1 + ': ' + emuApp);
				return;
			}
			prefs[emu].app = emuApp;
			cui.doAction('back');
		}
	}

	async installEmuApp() {
		$('body > :not(#dialogs)').addClass('dim');
		cui.clearDialogs();
		$('#dialogs').show();
		let wdw = electron.getCurrentWindow();
		wdw.focus();
		wdw.setFullScreen(false);
		let res = await nostlan.installer.install();
		wdw.focus();
		wdw.setFullScreen(prefs.ui.launchFullScreen);
		cui.clearDialogs();
		$('body > :not(#dialogs)').removeClass('dim');
		if (res) {
			await createTemplate();
		}
		return res;
	}

	async onChange() {
		$('#emuAppMenu_6 .opt0').text(
			lang.emuAppMenu_6.opt0 + ' ' + prefs[emu].name
		);
		$('#emuAppMenu_6 .opt1').text(
			lang.emuAppMenu_6.opt1 + ' ' + prefs[emu].name
		);
	}

	async afterChange() {
		$('body > :not(#dialogs)').removeClass('dim');
		cui.clearDialogs();
	}
}
module.exports = new CuiState();
