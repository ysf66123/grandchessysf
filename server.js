const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, '.')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log('\n==============================================');
    console.log('🚀 Grandmaster Pro yerel sunucusu baslatildi!');
    console.log('🌐 Site Linki: http://localhost:' + port);
    console.log('==============================================\n');
    console.log('Tarayicinizda yukaridaki linke giderek siteyi goruntuleyebilirsiniz.\nKapatmak icin CTRL+C yapabilirsiniz.');
});