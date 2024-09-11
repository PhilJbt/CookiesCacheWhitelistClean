// Public Suffix List library
// Used to determine the validity of a given domain
// https://github.com/lupomontero/psl
importScripts('psl.min.js');
// Url cleaning functions
importScripts('urlTools.js');

/**
* Triggered when the extension is installed
*/
chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === 'install') {
		// Store empty whitelists at install
		let storageListNames = [
			'cookiesWhitelist',
			'cacheWhitelist',
			'localStorageWhitelist',
			'webSQLWhitelist',
			'fileSystemsWhitelist',
			'indexedDBWhitelist',
			'serviceWorkersWhitelist',
			'cacheStorageWhitelist'
		];
		
		storageListNames.forEach((e) => {
			chrome.storage.sync.set({ [e]: [] });
		});
		
		// Open the full tab popup.html page
		chrome.runtime.openOptionsPage();
	}
});

/**
* Sends a notification, and remove it after 3 seconds
* @param {dict[string]} _message - The title and the message of the notification
*/
async function sendNotif(_message) {
	const notifId = await chrome.notifications.create({
			type: 'basic',
			iconUrl: 'img/icn16.png',
			title: _message.notifTtl,
			message: _message.notifMsg,
			priority: 2
		});
	
	setTimeout(() => {
		chrome.notifications.clear(notifId);
	}, 3000);
}

/**
* Message pump, sender is options.js
* @return {bool} If true, the response to the message will be sent asynchronously
*/
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// A Clean button has been pressed by the user
  if (message.type === 'forceClear') {
		clearBrowsingData(message.cleartype);
    const result = "cleared";
    sendResponse({ result });
  }
	// Display a badget on thee extension icon about the current tab domain
	else if (message.type === 'badgeSet') {
    chrome.browserAction.setBadgeText({
      tabId: sender.tab.id,
      text: message.badgeText,
    }, () => chrome.runtime.lastError);
  }
	// Show a browser notification
	else if (message.type === 'notify') {
		sendNotif({notifTtl: message.notifTtl, notifMsg: message.notifMsg});
	}
	
  return true;
});

/**
* Triggered when the url of a tab is changed
** Used to display the number of whiteslists in which the current tab domain included
*/
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	// Clean the url
	let urlCurrent = getDomainOnly(tab.pendingUrl || tab.url || '');
	
	// The current tab domain is valid
	if (psl.isValid(urlCurrent)) {
		// Keep only domains label
		urlCurrent = trimSubdomain(urlCurrent, true);
		
		// Retrieve all whitelists stored
		chrome.storage.sync.get([
			'cookiesWhitelist',
			'cacheWhitelist',
			'localStorageWhitelist',
			'webSQLWhitelist',
			'fileSystemsWhitelist',
			'indexedDBWhitelist',
			'serviceWorkersWhitelist',
			'cacheStorageWhitelist'
		], function(data) {
			// Store all whitelists in an array to an easier iteration over them
			let datas = [
				data.cookiesWhitelist,
				data.cacheWhitelist,
				data.localStorageWhitelist,
				data.webSQLWhitelist,
				data.fileSystemsWhitelist,
				data.indexedDBWhitelist,
				data.serviceWorkersWhitelist,
				data.cacheStorageWhitelist
			];
			
			// Declare the count of how many whitelists includes the current tab domain
			let count = 0;
			
			// Iterate over all whitelists
			datas.forEach((arr) => {
				// Iterate over all stored domains in this whitelist
				arr.forEach((str) => {
					// If the whitelist includes the current tab domain 
					if (str.endsWith(urlCurrent))
						++count;
				});
			});

			// Display a badge over the extension icon
			chrome.action.setBadgeText({
					tabId: tabId,
					// Use the number of whitelists in which the domain is included as text
					// If zero, use empty string to hide the badge (in case of an updated tab)
					text: count ? count.toString() : '',
			}, () => chrome.runtime.lastError);
		});
	}
	// The domain is not valid, hide the badge
	else
		chrome.action.setBadgeText({text: ''});
});

/**
* Triggered at browser startup
** Used to flush not whitelisted browsing data
*/
chrome.runtime.onStartup.addListener(() => {
	clearBrowsingData(null);
});

/**
* Function to clear a specific browsingData type
* @param {string} _type - The specified browsing data targeted
* @param {array[string]} _origin - Domains list not to wipe
*/
function clearBrowsingData_(_type, _origin) {
	// Specify which type of browsing data to wipe
	let dataToRemove = {};
	dataToRemove[_type] = true;
	
	// Cleanse specified browsing data from domains not specified
	chrome.browsingData.remove({
			"since": 0,
			"originTypes": {
				"unprotectedWeb": true
			},
			"excludeOrigins": _origin,
		},
		dataToRemove,
		function() {
			//console.log(`${_type} cleared with excludedOrigins ${_origin}`);
		}
	);
}

/**
* In the processing loop of all browsing data, does the specified type has to be cleaned
* according to user request and the status of the corresponding ON/OFF html switch
* @param {(string || null)} _cleartype - The name of a specific type of browsing data asked to be cleaned by the user
* @param {string} _switcher - The state of the html switch corresponding to the browsing data type provided ('true' or 'false')
* @param {string} _currenttype - The name of the current type of browsing data processed in the loop
* @return {string} Do the provided browsing data type has to be cleaned whether or not
*/
function willClear(_cleartype, _switcher, _currenttype) {
	// The switch status has already been stored
	if (_cleartype !== null) {
		// The type of browsing data processed in the loop and the type of browsing data requested for wiping are corresponding
		if (_cleartype === _currenttype)
			// The type of navigation data will be wiped
			return 'true';
		else
			// The type of navigation data will not be wiped
			return 'false';
	}
	// Switch state not defined, use default state 'true' (do wipe)
	else
		return (_switcher || 'true');
}

/**
* For a given domain, specify all domain forms under which navigation data may have been recorded under
* @param {(string || null)} _cleartype - Optional, the name of a specific type of browsing data to be cleaned
*/
function fullDomainForms(_arr, _cookies) {
	return (_arr || []).flatMap(dom => {
		const domTld = psl.get(dom);
		return _cookies === 1
			// Forms a domain can be registered under when using chrome.cookies.remove
			? [
				domTld,
				`.${domTld}`,
				`http://${domTld}`,
				`https://${domTld}`
			]
			// Forms a domain can be registered under when using chrome.browsingData.remove
			// If browsing data type is Cookies, remove any sub-domain
			: [
				`http://${_cookies ? domTld : dom}`,
				`https://${_cookies ? domTld : dom}`
			];
	});
}

/**
* Load stored whitelists in vue to clear browsing data
* @param {(string || null)} _cleartype - Optional, the name of a specific type of browsing data to be cleaned
*/
function clearBrowsingData(_cleartype = null) {
  // Retrieve whitelists from Chrome storage
  chrome.storage.sync.get([
	  'cookiesWhitelist',
	  'cacheWhitelist',
	  'localStorageWhitelist',
	  'webSQLWhitelist',
	  'fileSystemsWhitelist',
	  'indexedDBWhitelist',
	  'serviceWorkersWhitelist',
	  'cacheStorageWhitelist',
		'cookiesSwitcher',
	  'cacheSwitcher',
	  'localStorageSwitcher',
	  'webSQLSwitcher',
	  'fileSystemsSwitcher',
	  'indexedDBSwitcher',
	  'serviceWorkersSwitcher',
	  'cacheStorageSwitcher'
  ], function(data) {
			// Retrieves all the different forms in which a domain can be registered under
			const cookiesWhitelist_cookieAPI = fullDomainForms(data.cookiesWhitelist, 1);
			const cookiesWhitelist_browsingdataAPI = fullDomainForms(data.cookiesWhitelist, 2);
			const cacheWhitelist = fullDomainForms(data.cacheWhitelist, 0);
			const localStorageWhitelist = fullDomainForms(data.localStorageWhitelist, 0);
			const webSQLWhitelist = fullDomainForms(data.webSQLWhitelist, 0);
			const fileSystemsWhitelist = fullDomainForms(data.fileSystemsWhitelist, 0);
			const indexedDBWhitelist = fullDomainForms(data.indexedDBWhitelist, 0);
			const serviceWorkersWhitelist = fullDomainForms(data.serviceWorkersWhitelist, 0);
			const cacheStorageWhitelist = fullDomainForms(data.cacheStorageWhitelist, 0);
			
			// Which browsing data types should be wiped, in accordance with:
			// - the html switch ON/OFF button;
			// - the wipe of all browsing data types at startup;
			// - the Clear html button potentially pressed by the user for a specific browsing data type.
			const cookiesSwitcher = willClear(_cleartype, data.cookiesSwitcher, 'cookies');
			const cacheSwitcher = willClear(_cleartype, data.cacheSwitcher, 'cache');
			const localStorageSwitcher = willClear(_cleartype, data.localStorageSwitcher, 'localStorage');
			const webSQLSwitcher = willClear(_cleartype, data.webSQLSwitcher, 'webSQL');
			const fileSystemsSwitcher = willClear(_cleartype, data.fileSystemsSwitcher, 'fileSystems');
			const indexedDBSwitcher = willClear(_cleartype, data.indexedDBSwitcher, 'indexedDB');
			const serviceWorkersSwitcher = willClear(_cleartype, data.serviceWorkersSwitcher, 'serviceWorkers');
			const cacheStorageSwitcher = willClear(_cleartype, data.cacheStorageSwitcher, 'cacheStorage');
			
			// Delete Cookies if applicable
			if (cookiesSwitcher === 'true') {
				// Not using the chrome.cookies API function will result in certain targeted cookies not being deleted
				chrome.cookies.getAll({}, (cookies) => {
						cookies.forEach((cookie) => {
								// Check if the cookie's domain is not in the excluded list
								if (!cookiesWhitelist_cookieAPI.some((excludedDomain) => cookie.domain.includes(excludedDomain))) {
										// Remove the cookie
										chrome.cookies.remove({
											url: (cookie.secure ? "https://" : "http://") + cookie.domain + cookie.path,
											name: cookie.name
										}, (details) => {
										//console.log(`Removed cookie: ${details.name} from ${(details.secure ? 'https://' : 'http://')}${cookie.domain}`);
									});
								}
						});
				});
		
				clearBrowsingData_("cookies", cookiesWhitelist_browsingdataAPI); // cookies
			}
			
			// Delete other types of browsing data, if applicable
			if (cacheSwitcher === 'true')
				clearBrowsingData_("cache", cacheWhitelist); // cache for resources files (e.g. font, img, js, etc)
			if (localStorageSwitcher === 'true')
				clearBrowsingData_("localStorage", localStorageWhitelist); // localStorage.getItem and .setItem
			if (webSQLSwitcher === 'true')
				clearBrowsingData_("webSQL", webSQLWhitelist); // deprecated storing API
			if (fileSystemsSwitcher === 'true')
				clearBrowsingData_("fileSystems", fileSystemsWhitelist); // stores files on users' hdd
			if (indexedDBSwitcher === 'true')
				clearBrowsingData_("indexedDB", indexedDBWhitelist); // persistently DB data storing
			if (serviceWorkersSwitcher === 'true')
				clearBrowsingData_("serviceWorkers", serviceWorkersWhitelist); // background running background
			if (cacheStorageSwitcher === 'true')
				clearBrowsingData_("cacheStorage", cacheStorageWhitelist); // storage mainly (but not only) used by service workers
	});
}