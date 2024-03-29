const migrationDocUrl = () => {
	let language = 'en';
	if (global.locale === 'ja' || process.env.LOCALE === 'ja') language = 'ja';
	return `https://${language}.docs.monaca.io/products_guide/migration`;
}

const updateDocUrl = () => {
	let language = 'en';
	if (global.locale === 'ja' || process.env.LOCALE === 'ja') language = 'ja';
	return `https://${language}.docs.monaca.io/release_notes/20180918_monaca_cli_3.0/`;
}

module.exports = {
  migrationDocUrl,
  updateDocUrl
};