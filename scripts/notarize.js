const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') {
    return
  }

  const appId = 'com.smoke.app'
  const appPath = `${appOutDir}/${context.packager.appInfo.productFilename}.app`

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_ID_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID not set')
    return
  }

  console.log(`Notarizing ${appId} at ${appPath}...`)

  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId
  })

  console.log('Notarization complete')
}
