const migrationDocUrl = () => {
	let language = 'en';
	if (global.locale === 'ja' || process.env.LOCALE === 'ja') language = 'ja';
	return `https://docs.monaca.io/${language}/products_guide/migration`;
}

module.exports = {
  migrationDocUrl
};