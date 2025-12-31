module.exports = async function handler(req, res) {
  const url = process.env.INSTALLER_URL;
  if (!url) {
    res.statusCode = 302;
    res.setHeader('Location', '/?installer=missing');
    res.end();
    return;
  }

  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
