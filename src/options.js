/**
* Populate the DOM when the popup is opened
*/
document.addEventListener('DOMContentLoaded', function() {
	// Entry point
	populatePopup();
	showDetails();
	localize();
	modalInit();
	clearInit();

	/**
	* Retrieve whitelists and switch states from storage
	* @param {array} _browsingDataTypes - Browsing data types to process
	* @param {(string || null)} _urlCurrent - Current tab url
	* @param {bool} _bSwitch - Do the switch shoud be setup
	*/
	function storageGet(_browsingDataTypes, _urlCurrent, _bSwitch = true) {
		// Prepare switch and whitelist names in accordance with browsing data types provided
		let arrStorageNames = [];
		_browsingDataTypes.forEach((e) => {
			arrStorageNames.push(`${e}Whitelist`);
			arrStorageNames.push(`${e}Switcher`);
		});
		
		// Load whitelists and switch states from Chrome storage
		chrome.storage.sync.get(
			arrStorageNames,
			function(data) {
				_browsingDataTypes.forEach((e) => {
					// Show whitelisted domains for each browsing data type
					whitelistDisplay(data[`${e}Whitelist`] || [], e, _urlCurrent);	
					// Load and set the switch states
					if (_bSwitch)
						switchSetup(`${e}Switcher`, data[`${e}Switcher`] || null);
				});
		});
	}

	/**
	* Fill in the details summary div with domains already whitelisted
	* @param {array[string]} _whitelist - List of whitelisted domains
	* @param {string} _typeName - Type of browsing data
	* @param {(string || null)} _urlCurrent - Current tab url
	*/
	function whitelistDisplay(_whitelist, _typeName, _urlCurrent) {
		// Sort domains alphabetically
		_whitelist.sort();
		
		// Get the summary DOM node
		var sumCount = document.getElementById(`sumCount-${_typeName}`);
		// Fill the summary attribute with the number of domains whitelisted
		sumCount.setAttribute("count", _whitelist.length.toString());
		
		// Get the whitelisted domains list DOM node
		var ul = document.getElementById(`${_typeName}-whitelist`);
		
		// Iterate over whitelisted domains
		_whitelist.forEach((domain, index) => {
			// Create a list html fragment
			const li = document.createElement('li');
			// Fill the text content with the currently iterated domain
			li.textContent = domain;
			
			// Current tab url and current iterated domain are valid
			if (psl.isValid(_urlCurrent || '')
				&& psl.isValid(domain || ''))
				// Iterated domain ends up with current tab url
				// Or the current tab url includes the iterated domain
				if (_urlCurrent.endsWith(domain)
					|| domain.includes(_urlCurrent)) { // CAUTION : Whitelisted Cookies' domains do not include sub-domains
					document.getElementById(`details-${_typeName}`).setAttribute("open", "open");
					li.classList.add("anim-blink");
				}
			
			// Create a button
			const btn = document.createElement('input');
			btn.classList.add("btn-rem");
			btn.type = "button";
			// Bind domain removal from whitelist to a callback
			btn.onclick = function() {
				whitelistDomainRemove(domain, _typeName);
				ul.innerHTML = '';
			};
			// Add the button to the list html fragment
			li.prepend(btn);
			// Add the list html fragment to the whitelist node
			ul.appendChild(li);
		});
	}

	/**
	* Set switch states
	* Bind them with their on/off callbacks
	* @param {string} _htmlId - ID of the html input switch button
	* @param {dict[string || null]} _state - Switch state ('true' or 'false')
	*/
	function switchSetup(_htmlId, _state) {
		// Get the html input switch button
		const elem = document.getElementById(_htmlId);
		// Set the switch state based on whether whitelist cleaning is enabled or disabled
		elem.checked = ((_state || 'true') === 'true')
		// Listen for switch state changes and store it
		elem.addEventListener('change', function() {
			chrome.storage.sync.set({ [_htmlId]: (elem.checked ? 'true' : 'false') });
		});
	}

	/**
	* Add a domain to the whitelist
	* @param {string} _type - Browsing data type
	* @return {bool} The specified domain is valid
	*/
	function whitelistDomainAdd(_type) {
		const domainInputId = `${_type}-domain`;
		const storageKey = `${_type}Whitelist`;
		const cookies = _type === 'cookies';
		
		// Trip begin/end spaces and remove Host Name Label from domain
		let domain = psl.parse(getDomainOnly(document.getElementById(domainInputId).value));
		// Remove Subdomain Label if currently working of the Cookies whitelist
		domain = trimSubdomain(domain, cookies);
		
		if (domain) {
			try {
				if (psl.isValid(domain || '')) {
					// Get whitelisted domain of the current whitelist
					chrome.storage.sync.get([storageKey], function(data) {
						// The exact domain is not whitelisted
						if (!(data[storageKey] || []).includes(domain)) {
							// Get the stored whitelist
							let whitelist = data[storageKey] || [];
							// Add the desired domain
							whitelist.push(domain);
							// Store the modified whitelist
							chrome.storage.sync.set({ [storageKey]: whitelist });
							// Empty all entries in the list
							document.getElementById(`${_type}-whitelist`).innerHTML = '';
							// Fill in the concerned whitelist only
							storageGet([_type], domain, false);							
							// Domain is valid
							return true;
						}
						else
							// Domain is not valid
							return false;
					});
				}
				// The domain is not valid, according to psl
				else
					return false;
			}
			// CAUTION : psl throws exceptions if param is not a string
			catch {
				return false;
			}
		}
		else
			return false;
	}

	/**
	* Remove a domain from the whitelist
	* @param {string} _domain - Domain name to remove
	* @param {string} _browsingDataType - Whitelist name
	*/
	function whitelistDomainRemove(_domain, _browsingDataType) {
			const storageKey = `${_browsingDataType}Whitelist`;
		chrome.storage.sync.get([storageKey], function(data) {
			// Get the whitelist
			let whitelist = data[storageKey] || [];
			// Get the array index of the desired domain
			const index = whitelist.indexOf(_domain);
			// Remove the desired domain
			whitelist.splice(index, 1);
			// Store the updated whitelist
			chrome.storage.sync.set({ [storageKey]: whitelist });
			// Empty all entries in the list
			document.getElementById(`${_browsingDataType}-whitelist`).innerHTML = '';
			// Fill in the concerned whitelist only
			storageGet([_browsingDataType], _domain, false);
		});
	}
	/**
	* Load and show whitelists
	* Load and show switchers
	* Fill inputs text with the current url
	* Bind switch, remove buttons and inputs text with callbacks
	*/
	function populatePopup() {
		// Get the current url of the active tab
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs[0];
			let urlCurrent = null;
			
			if (tab) {
				let url = psl.parse(getDomainOnly(tab.pendingUrl || tab.url || ''));
				
				if (psl.isValid(url.domain || '')) {
					// Store current tab url since it's valid
					// Used in the following sequence to fill in text inputs
					// Its future use is to check whether the url of the current tab is already whitelisted
					urlCurrent = trimSubdomain(url, true);
					
					// For all the text inputs
					document.querySelectorAll('input[type="text"]').forEach((e) => {
						// Fill the text input with the domain (with or without the Host Name Label)
						e.value = trimSubdomain(url, e.id === 'cookies-domain');
					});
				}
			}
			
			// Load whitelists and show them
			// Load switchers data and set their states
			const browsingDataTypetypes = [
				'cookies',
				'cache',
				'localStorage',
				'webSQL',
				'fileSystems',
				'indexedDB',
				'serviceWorkers',
				'cacheStorage'
			];
			storageGet(browsingDataTypetypes, urlCurrent);
		});
		
		// For all the text inputs
		document.querySelectorAll('input[type="text"]').forEach((e) => {
			// Bind it to the domain checking callback
			e.addEventListener('input', function() {
				if (e.value.length > 0) {
					try {
						if (psl.isValid(e.value))
							e.style.backgroundColor = '#e8e8e8';
						else
							e.style.backgroundColor = '#ffbdbd';
					}
					catch {
						e.style.backgroundColor = '#ffbdbd';
					}
				}
				else
					e.style.backgroundColor = '#e8e8e8';
			});
		});
		
		// For every whitelists
		[
			'cookies',
			'cache',
			'localStorage',
			'webSQL',
			'fileSystems',
			'indexedDB',
			'serviceWorkers',
			'cacheStorage'
		].forEach((browsingDataType, index) => {
			// Bind callback to text inputs adding a domain
			document.getElementById(`add-${browsingDataType}-domain`).addEventListener('click', function() {
				// Try to add the domain to the desired whitelist
				if (whitelistDomainAdd(browsingDataType)) {
					// Empty the content of the input text
					document.getElementById(`${browsingDataType}-domain`).value = '';
					// Empty all entries in the list
					document.getElementById(`${browsingDataType}-whitelist`).innerHTML = '';
				}
			});
		});
	}

	/**
	* Apply localization
	*/
	function localize() {
		// For each html node having a localization attribute
		document.querySelectorAll('[data-i18n]').forEach((e) => {
			// Get the name of the string stored in messages.json
			const attr = e.getAttribute('data-i18n');
			// Get the three first letters of the name
			switch(attr.substr(0, 3)) {
				// InnerHTML
				case 'ih_':
					e.innerHTML = chrome.i18n.getMessage(attr);
					break;
				// Placeholder
				case 'ph_':
					e.placeholder = chrome.i18n.getMessage(attr);	
					break;
			}
		});
	}
	
	/**
	* Shows hidden details (note boxes) if opened in a tab (in contrast to the popup form)
	*/
	function showDetails() {
		// Get url parameters
		const params = new URLSearchParams(window.location.search);
		
		// If the page is opened as a tab (see manifest.json)
		if (params.get('type') !== 'popup') {
			// Display all note boxes
			document.querySelectorAll('.note-cont').forEach((e) => {
				e.style.display = "flex";
			});
			
			// Display the backup container
			document.getElementById('cont-backup').style.display = 'flex';
			
			// Bind the Export button to the whitelists export callback
			document.getElementById('btn-export').addEventListener('click', function() {
				// Get the current date
				const t = new Date();
				const y = t.getFullYear();
				const m = String(t.getMonth() + 1).padStart(2, '0');
				const d = String(t.getDate()).padStart(2, '0');
				
				// Get all whitelists
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
					const blob = new Blob([JSON.stringify(data)], { type: 'text/plain' });
					const url = URL.createObjectURL(blob);

					// Use the Chrome downloads API to download the file
					chrome.downloads.download({
						url: url,
						filename: `${chrome.i18n.getMessage('extTitleExport')}-backup_${y}${m}${d}.txt`,
						saveAs: true
					});
				});
			});
			
			// Bind the Import button to the whitelists import callback
			document.getElementById('btn-import').addEventListener('input', function() {
				// Get the selected file
				const file = event.target.files[0];

				if (file) {
					// Declare the reader
					const reader = new FileReader();

					// Define the processing behavior of the reader
					reader.onloadend = function(e) {
						try {
							const content = e.target.result;
							const arrData = JSON.parse(content);
							
							// Iterate over every whitelists in the imported data
							for (let storageKey in arrData) {
								if (arrData[storageKey].length > 0) {
									const browsingDataType = storageKey.replace('Whitelist', '');
									
									// Get the currently stored whitelist for this type of browsing data
									chrome.storage.sync.get([storageKey], function(data) {
										// Duplicate the currently store whitelist
										let whitelist = data[storageKey] || [];
										
										// Iterate over every domain in the imported data
										arrData[storageKey].forEach((dom) => {
											// Format and check the domain validity
											let newDom = trimSubdomain(getDomainOnly(dom), browsingDataType === 'cookies');
											if (newDom
											&& psl.isValid(newDom || '')) {
													if (!whitelist.includes(newDom))
														whitelist.push(newDom);
											}
										});
										
										// Save the updated whitelist
										chrome.storage.sync.set({ [storageKey]: whitelist });
										// Empty the html whitelists of the same Type
										document.getElementById(`${browsingDataType}-whitelist`).innerHTML = '';
										// Fill in the concerned whitelist only
										storageGet([browsingDataType], null, false);
									});
								}
							}
						}
						catch(err) {}
					};

					// Run the reader processing
					reader.readAsText(file);
				}
			});
		}
	}

	/**
	* Initialize the Cancel button in the modal window
	*/
	function modalInit() {
		// Bind the Cancel button to the callback
		document.getElementById('modalbtnn').addEventListener("click", function() {
			// Remove the Confirm onclick button callback
			document.getElementById('modalbtny').onclick = null;
			// Hide the modal window
			document.getElementById('modal').style.display = 'none';
		});
	}
	
	/**
	* Initialize every Clear button
	*/
	function clearInit() {
		// Iterate over all Clear buttons
		document.querySelectorAll('.btnClear').forEach((e) => {
			// Bind a onClick callback to it
			e.addEventListener('click', function() {
				// Get the Browsing data type to wipe
				const cleartype = e.getAttribute('data-type');
				// Bind a onClick callback to the Confirm button
				document.getElementById('modalbtny').onclick = function() {
					// Remove the onClick callback of the Confirm button
					document.getElementById('modalbtny').onclick = null;
					// Send a message to background.js
					chrome.runtime.sendMessage({ type: 'forceClear', cleartype: cleartype }, (response) => {
						// Disable the Clear button
						e.disabled = true;
						// If background.js answer it's done
						if (response && response.result === 'cleared') {
							// Hide the modal window
							document.getElementById('modal').style.display = 'none';
							// Send a browser notification
							chrome.runtime.sendMessage({
									type: 'notify',
									notifTtl: chrome.i18n.getMessage('sz_notifyTitle'),
									notifMsg: chrome.i18n.getMessage('sz_notifyCleared').replace('%TYPE%', cleartype.charAt(0).toUpperCase() + cleartype.slice(1))
								}, (response) => {}
							);
						}
					});
				};
				
				// Populate and show the modal window
				document.getElementById('modalMsg').innerHTML = chrome.i18n.getMessage('sz_promptConfirm').replace('%TYPE%', cleartype.charAt(0).toUpperCase() + cleartype.slice(1));
				document.getElementById('modal').style.display = 'flex';
			});
		});
	}
});
