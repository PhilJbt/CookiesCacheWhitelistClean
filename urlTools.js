/**
* Clean the given url
* @param {string} _url - Given domain
* @return {string} Domain without spaces, protocol, path nor parameters
*/
function getDomainOnly(_url) {
	if ((_url || '').length > 0) {
		let newUrl = _url.trim().replace(/^(https?:\/\/?)/i, '');
		if (newUrl.indexOf('/') > -1)
			newUrl = newUrl.substr(0, newUrl.indexOf('/'))
		return newUrl;
	}
	else
		return '';
}

/**
* Retrieve only the domain (with or without sub-domains) of the given url
* @param {(string || psl object)} _url - Given domain
* @param {bool} _cookies - The domain requires specific processing of cookie navigation data
* @return {string} The domain with or without sub-domains
*/
function trimSubdomain(_url, _cookies) {
	let url = typeof(_url) === 'string' ? psl.parse(_url) : _url;
	const f = _cookies === false ? ((url.subdomain !== null ? url.subdomain + '.' : '') + url.domain) : url.domain; // For Cookies whitelist, remove the Host Name Label
	return f;
}