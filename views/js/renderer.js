/*
 * renderer.js handles responses to user interactions with the menu and app UI
 * authors: quinton-ashley
 * copyright 2018
 */
module.exports = async function(opt) {
	const err = console.error;
	const log = console.log;
	global.__rootDir = opt.__rootDir;

	const remote = require('electron').remote;
	const {
		app,
		dialog,
		Menu
	} = remote;
	const deepExtend = require('deep-extend');
	const delay = require('delay');
	const fs = require('fs-extra');
	const Fuse = require('fuse.js');
	const klawSync = require('klaw-sync');
	const os = require('os');
	const path = require('path');
	const pug = require('pug');
	const $ = require('jquery');
	var Mousetrap = require('mousetrap');
	const osType = os.type();
	const linux = (osType == 'Linux');
	const mac = (osType == 'Darwin');
	const win = (osType == 'Windows_NT');
	const {
		Mouse,
		Keyboard,
		Gamepad,
		or,
		and
	} = require('contro');
	const botDir = path.join(os.homedir(), '/Documents/bottlenose');
	log(botDir);

	window.$ = window.jQuery = $;
	window.Tether = require('tether');
	window.Bootstrap = require('bootstrap');
	// var jQueryBridget = require('jquery-bridget');
	// var Masonry = require('masonry-layout');
	// // make Masonry a jQuery plugin
	// jQueryBridget('masonry', Masonry, $);
	const viewer = require('../js/gameLibViewer.js');

	// get the default prefrences
	let prefsDefaultPath = path.join(__rootDir, '/prefs/prefsDefault.json');
	let prefsDefault = JSON.parse(await fs.readFile(prefsDefaultPath));
	let prefsPath = botDir + '/usr/prefs.json';
	let prefs = prefsDefault;
	prefs.ui.mouse.wheel.multi = ((!mac) ? 1 : 0.25);
	prefs.ui.mouse.wheel.smooth = ((!mac) ? false : true);
	let sys = '';
	let sysStyle = '';
	let emuDir = '';
	let games = [];

	// make UI changes
	$('#update').hide();

	let introFiles = {
		css: {},
		html: {}
	};

	async function getIntroFile(type) {
		let fType = ((type == 'css') ? 'css' : 'html');
		if (!introFiles[fType][sysStyle]) {
			let introFile = path.join(__dirname,
				`../${type}/${sysStyle}Load.${type}`);
			if (fs.existsSync(introFile)) {
				if (type == 'css') {
					introFiles[fType][sysStyle] = `
					<link class="introStyle" rel="stylesheet" type="text/css" href="${introFile}">
					`;
				} else {
					introFile = await fs.readFile(introFile, 'utf8');
					if (type == 'pug') {
						introFile = pug.compile(introFile);
					}
					introFiles[fType][sysStyle] = introFile;
				}
			} else {
				if (type == 'pug') {
					getIntroFile('html');
				} else {
					introFiles[fType][sysStyle] = '';
				}
			}
		}
		$('body').prepend(introFiles[fType][sysStyle]);
	}

	const intro = async function() {
		await getIntroFile('pug');
		await getIntroFile('css');
		let hasJS = fs.existsSync(path.join(__dirname, `../js/${sysStyle}Load.js`));
		if (hasJS) {
			require(`../js/${sysStyle}Load.js`)();
		}
		await delay(1000);
	}


	String.prototype.replaceAt = function(index, replacement) {
		return this.substr(0, index) + replacement + this.substr(index + replacement.length);
	}

	function openLib() {
		let dir = dialog.showOpenDialog({
			properties: ['openDirectory'],
			title: `open ${sys} game library`,
			message: `choose the ${sys} game library`
		});
		return dir[0];
	}

	function chooseEmulatorsDir() {
		let dir = dialog.showOpenDialog({
			properties: ['openDirectory'],
			title: 'choose emulators folder',
			message: `choose the root emulators dir for bottlenose`
		});
		return dir[0];
	}

	function addGame(fuse, searchTerm) {
		let results = fuse.search(searchTerm);
		let region = prefs.region;
		for (let i = 0; i < results.length; i++) {
			if (results[i].title.length > searchTerm.length + 6) {
				continue;
			}
			// if the search term doesn't contain demo or trial
			// skip the demo/trial version of the game
			let demoRegex = /(Demo|Preview|Review|Trial)/i;
			if (demoRegex.test(results[i].title) != demoRegex.test(searchTerm)) {
				continue;
			}
			if (sys == 'wii' || sys == 'ds' || sys == 'wiiu' || sys == '3ds') {
				let gRegion = results[i].id[3];
				// TODO: this is a temporary region filter
				if (/[KWXDZIFSHYVRAC]/.test(gRegion)) {
					continue;
				}
				if (gRegion == 'E' && (region == 'P' || region == 'J')) {
					continue;
				}
				if (gRegion == 'P' && (region == 'E' || region == 'J')) {
					continue;
				}
				if (gRegion == 'J' && (region == 'E' || region == 'P')) {
					continue;
				}
			} else if (sys == 'switch') {
				let gRegion = results[i].id[4];
				if (gRegion == 'A' && (region == 'P' || region == 'J')) {
					continue;
				}
				if (gRegion == 'B' && (region == 'E' || region == 'J')) {
					continue;
				}
				if (gRegion == 'C' && (region == 'E' || region == 'P')) {
					continue;
				}
			}
			$('#loadDialog0').text('loading ' + results[i].title);
			return results[i];
		}
		return false;
	}

	async function reset() {
		games = [];
		let gameDB = [];
		let DBPath = path.join(__rootDir, `/db/${sys}DB.json`);
		gameDB = JSON.parse(await fs.readFile(DBPath)).games;
		log(gameDB);

		let options = {
			shouldSort: true,
			threshold: 0.4,
			location: 0,
			distance: 100,
			maxPatternLength: 32,
			minMatchCharLength: 1,
			keys: [
				"id",
				"title"
			]
		};
		let fuse = new Fuse(gameDB, options);
		let files = klawSync(prefs[sys].libs[0], {
			depthLimit: 0
		});
		let file;
		// a lot of pruning is required to get good search results
		for (let i = 0; i < files.length; i++) {
			file = files[i].path;
			log(file);
			let term = path.parse(file);
			if (term.base[0] == '.') {
				continue;
			}
			if (sys == 'ps3') {
				file += '/USRDIR/EBOOT.BIN';
			}
			if (sys != 'wiiu' && sys != 'ps3') {
				term = term.name;
			} else {
				term = term.base;
			}
			// eliminations part 1
			term = term.replace(/[\[\(](USA|World)[\]\)]/gi, '');
			term = term.replace(/[\[\(]*(NTSC)+(-U)*[\]\)]*/gi, '');
			term = term.replace(/[\[\(]*(N64|GCN)[,]*[\]\)]*/gi, '');
			term = term.replace(/[\[\(,](En|Ja|Eu)[^\]\)]*[\]\)]*/gi, '');
			// special complete subs part 1
			if (sys == 'wii') {
				term = term.replace(/ssbm/gi, 'Super Smash Bros. Melee');
				term = term.replace(/sm *64/gi, 'Super Mario 64');
			}
			term = term.replace(/mk(\d+)/gi, 'Mario Kart $1');
			// special check for ids
			log(term);
			let id;
			if (sys == 'switch') {
				id = term.match(/(?:^|[\[\(])([A-Z0-9]{3}[A-Z](?:|[A-Z0-9]))(?:[\]\)]|$)/);
			} else if (sys == 'ps3') {
				id = term.match(/(?:^|[\[\(])(\w{9})(?:[\]\)]|_INSTALL|$)/);
			} else {
				id = term.match(/(?:^|[\[\(])([A-Z0-9]{3}[A-Z](?:|[A-Z0-9]{2}))(?:[\]\)]|$)/);
			}
			if (id) {
				id = id[1];
				let game = gameDB.find(x => x.id === id);
				if (game) {
					if (sys == 'ps3') {
						let dup = games.find(x => x.title === game.title);
						if (dup) {
							continue;
						}
					}
					log('id: ' + id);
					log(game.title);
					game.file = file;
					games.push(game);
					continue;
				}
			}
			// replacements
			term = term.replace(/_/g, ' ');
			term = term.replace(/ -/g, ':');
			let temp = term.replace(/, The/gi, '');
			if (term != temp) {
				term = 'The ' + temp;
			}
			// eliminations part 2
			term = term.replace(/,/g, '');
			term = term.replace(/[\[\(](E|J|P|U)[\]\)].*/g, '');
			// special subs part 2
			if (sys == 'wii') {
				term = term.replace(/ 20XX.*/gi, ': 20XX Training Pack');
				term = term.replace(/Nickelodeon SpongeBob/gi, 'SpongeBob');
			} else if (sys == 'switch') {
				term = term.replace(/Nintendo Labo/gi, 'Nintendo Labo -');
			}
			// special subs part 3
			term = term.replace(/lego/gi, 'lego');
			term = term.replace(/warioware,*/gi, 'Wario Ware');
			term = term.replace(/ bros( |$)/gi, ' Bros. ');
			term = term.replace(/(papermario|paper mario[^\: ])/gi, 'Paper Mario');
			// eliminations part 3
			term = term.replace(/[\[\(]*(v\d]\.|\d+\.|rev \d).*/gi, '');
			term = term.replace(/\[[^\]]*\]/g, '');
			term = term.replace(/ *decrypted */gi, '');

			term = term.trim();
			// TODO: strings must be less than 32 chars
			log(term);
			let game = addGame(fuse, term);
			if (game) {
				log(game.title);
				game.file = file;
				games.push(game);
			}
		}
		let gamesPath = `${botDir}/usr/${sys}Games.json`;
		await fs.outputFile(gamesPath, JSON.stringify({
			games: games
		}));
	}

	async function reload() {
		$('body').removeClass();
		sysStyle = (prefs[sys].style || sys);
		$('body').addClass(sys + ' ' + sysStyle);
		if (sysStyle == 'gcn') {
			$('.cover.power .coverText').text('power');
			$('.cover.reset .coverText').text('reset');
			$('.cover.open .coverText').text('open');
		} else {
			$('.cover.power .coverText').text('Power');
			$('.cover.reset .coverText').text('Reset');
			$('.cover.open .coverText').text('Open');
		}
		await intro();
		$('#dialogs').show();
		let gamesPath = `${botDir}/usr/${sys}Games.json`;
		// if prefs exist load them if not copy the default prefs
		if (await fs.exists(gamesPath)) {
			games = JSON.parse(await fs.readFile(gamesPath)).games;
		} else {
			let emuDirExisted;
			if (!emuDir) {
				emuDir = chooseEmulatorsDir();
			} else {
				emuDirExisted = true;
			}
			let emu = prefs[sys].emu;
			let gameLibDir;
			let libPath;
			if (sys == 'ps3') {
				libPath = 'BIN/dev_hdd0/game';
			} else {
				libPath = 'GAMES';
			}
			gameLibDir = path.join(emuDir, `../${emu}/${libPath}`);
			if (!(await fs.exists(gameLibDir))) {
				gameLibDir = path.join(emuDir, `../${emu.toLowerCase()}`);
			}
			log(gameLibDir);
			if (!(await fs.exists(gameLibDir))) {
				gameLibDir = path.join(emuDir, `../${emu.toUpperCase()}`);
			}
			log(gameLibDir);
			if (await fs.exists(gameLibDir)) {
				if (!prefs[sys].libs) {
					prefs[sys].libs = [];
				}
				if (!prefs[sys].libs.includes(gameLibDir)) {
					prefs[sys].libs.push(gameLibDir);
				}
				if (!emuDirExisted) {
					emuDir += '/bottlenose';
				}
				await fs.ensureDir(emuDir);
				prefs.emuDir = emuDir;
			} else {
				log(`choose emulation folder with directory structure:
{root folder can have any name}
├─┬ Dolphin
│ ├─┬ BIN
│ │ ├── Languages
│ │ ├── Sys
│ │ ├── User
│ │ ├── portable.txt
│ │ ├── Dolphin.exe
│ │ └── ...
│ └─┬ GAMES
│   └── ...
├── Cemu
└── Yuzu`);
				prefs[sys].libs.push(openLib(sys));
			}
			await reset();
		}
		prefs.session.sys = sys;
		await fs.outputFile(prefsPath, JSON.stringify(prefs, null, '\t'));
	}

	async function load() {
		if (await fs.exists(prefsPath)) {
			let prefs1 = JSON.parse(await fs.readFile(prefsPath));
			deepExtend(prefs, prefs1);
			emuDir = prefs.emuDir;
		}
		// currently supported systems
		// let systems = ['wii', 'ds', 'wiiu', '3ds', 'switch', 'ps3'];
		// for (let i = 0; i < systems.length; i++) {
		// 	sys = systems[i];
		// 	$('#systemSel').append(`
		// 		<button class="${sys}" value="${sys}">${sys}</button>
		// 		`);
		// }
		sys = prefs.session.sys;
		await reload();
	}

	await load();
	await viewer.load(games, prefs, sys);

	function removeIntro() {
		$('#intro').remove();
		$('link.introStyle').prop('disabled', true);
		$('link.introStyle').remove();
	}

	async function powerBtn() {
		await viewer.powerBtn();
		await intro();
		await viewer.load(games, prefs, sys);
		removeIntro();
	}

	async function resetBtn() {
		viewer.remove();
		await intro();
		await reset();
		await viewer.load(games, prefs, sys);
		removeIntro();
	}

	async function open() {
		if (!viewer) {
			return;
		}
		viewer.remove();
		await reload();
		await viewer.load(games, prefs, sys);
		removeIntro();
	}

	async function openBtn() {
		sys = '3ds';
		await open();
	}

	$('#power').click(powerBtn);
	$('#reset').click(resetBtn);
	$('#open').click(openBtn);

	function hideNav() {
		$('nav').toggleClass('hide');
		// return false to prevent default browser behavior
		// and stop event from bubbling
		return false;
	}

	Mousetrap.bind(['command+n', 'ctrl+n'], hideNav);
	Mousetrap.bind(['space'], function() {
		return false
	});
	Mousetrap.bind(['up', 'down', 'left', 'right'], function() {
		return false
	});

	let gamepad = new Gamepad();
	let gamepadConnected = false;

	let btns = ['A', 'B', 'X', 'Y', 'Up', 'Down', 'Left', 'Right'];
	let btnStates = {};
	for (let i of btns) {
		btnStates[i] = false;
	}
	let gvMainMenuLabels = {
		X: 'power',
		Y: 'reset',
		B: 'open'
	};

	// Xbox One controller mapped to
	// Nintendo Switch controller button layout
	//  X A
	// Y B
	let map = {
		A: 'B',
		B: 'A',
		X: 'Y',
		Y: 'X'
	};

	async function buttonPressed(btn) {
		switch (btn.label) {
			case 'A':
				break;
			case 'B':
				await openBtn();
				break;
			case 'X':
				await powerBtn();
				break;
			case 'Y':
				await resetBtn();
				break;
			default:

		}
	}

	async function loop() {
		if (gamepadConnected || gamepad.isConnected()) {
			for (let i of btns) {
				i = map[i] || i;
				let btn = gamepad.button[i];

				if (!gamepadConnected) {
					let $button = $('#' + gvMainMenuLabels[i]);
					$button.text(btn.label);
				}
				let query = btn.query();
				// if button state is unchanged
				if ((btnStates[i] && query) || (!btnStates[i] && !query)) {
					continue;
				}
				btnStates[i] = query;
				// if button state is false (unpressed)
				if (!query) {
					log(btn.label + 'button press end');
					continue;
				}
				log(btn.label + 'button press start');
				await buttonPressed(btn);
			}
			gamepadConnected = true;
		}
		requestAnimationFrame(loop);
	}

	loop();

	removeIntro();
};