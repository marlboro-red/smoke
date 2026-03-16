import { useState, useEffect, useCallback } from 'react'
import type { PluginInfo, PluginConfigField } from '../../preload/types'
import { usePlugins } from '../stores/pluginStore'
import { pluginStore } from '../stores/pluginStore'

interface PluginConfigValues {
  [pluginName: string]: Record<string, unknown>
}

export default function PluginSettings(): JSX.Element {
  const plugins = usePlugins()
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>([])
  const [configValues, setConfigValues] = useState<PluginConfigValues>({})
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null)

  useEffect(() => {
    // Load plugins if not yet loaded
    if (plugins.length === 0) {
      pluginStore.getState().loadPlugins()
    }
    // Load disabled list
    window.smokeAPI?.plugin.getDisabled().then(setDisabledPlugins)
  }, [])

  // Load config values when a plugin is expanded
  useEffect(() => {
    if (expandedPlugin && !configValues[expandedPlugin]) {
      window.smokeAPI?.plugin.getConfig(expandedPlugin).then((values) => {
        setConfigValues((prev) => ({ ...prev, [expandedPlugin]: values }))
      })
    }
  }, [expandedPlugin])

  const toggleEnabled = useCallback(async (pluginName: string, enabled: boolean) => {
    await window.smokeAPI?.plugin.setEnabled(pluginName, enabled)
    setDisabledPlugins((prev) =>
      enabled ? prev.filter((n) => n !== pluginName) : [...prev, pluginName]
    )
  }, [])

  const updateConfig = useCallback(async (pluginName: string, key: string, value: unknown) => {
    await window.smokeAPI?.plugin.setConfig(pluginName, key, value)
    setConfigValues((prev) => ({
      ...prev,
      [pluginName]: { ...prev[pluginName], [key]: value },
    }))
  }, [])

  if (plugins.length === 0) {
    return (
      <div className="plugin-settings-empty">
        No plugins installed
      </div>
    )
  }

  return (
    <div className="plugin-settings">
      {plugins.map((plugin) => {
        const isDisabled = disabledPlugins.includes(plugin.name)
        const isExpanded = expandedPlugin === plugin.name
        const hasConfig = plugin.configSchema && Object.keys(plugin.configSchema).length > 0

        return (
          <div key={plugin.name} className="plugin-item">
            <div className="plugin-item-header">
              <div className="plugin-item-info">
                <div className="plugin-item-title">
                  {hasConfig ? (
                    <button
                      className="plugin-expand-btn"
                      onClick={() => setExpandedPlugin(isExpanded ? null : plugin.name)}
                      title={isExpanded ? 'Collapse settings' : 'Expand settings'}
                    >
                      {isExpanded ? '\u25B4' : '\u25BE'}
                    </button>
                  ) : (
                    <span className="plugin-expand-spacer" />
                  )}
                  <span className={`plugin-name ${isDisabled ? 'disabled' : ''}`}>
                    {plugin.name}
                  </span>
                  <span className="plugin-version">v{plugin.version}</span>
                  <span className="plugin-source">{plugin.source}</span>
                </div>
                <div className="plugin-description">{plugin.description}</div>
              </div>
              <label className="plugin-toggle" title={isDisabled ? 'Enable plugin' : 'Disable plugin'}>
                <input
                  type="checkbox"
                  checked={!isDisabled}
                  onChange={(e) => toggleEnabled(plugin.name, e.target.checked)}
                />
              </label>
            </div>
            {isExpanded && hasConfig && (
              <PluginConfigForm
                plugin={plugin}
                values={configValues[plugin.name] ?? {}}
                onUpdate={(key, value) => updateConfig(plugin.name, key, value)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function PluginConfigForm({
  plugin,
  values,
  onUpdate,
}: {
  plugin: PluginInfo
  values: Record<string, unknown>
  onUpdate: (key: string, value: unknown) => void
}): JSX.Element {
  const schema = plugin.configSchema!

  return (
    <div className="plugin-config-form">
      {Object.entries(schema).map(([key, field]) => (
        <PluginConfigFieldInput
          key={key}
          fieldKey={key}
          field={field}
          value={values[key] ?? field.default}
          onChange={(value) => onUpdate(key, value)}
        />
      ))}
    </div>
  )
}

function PluginConfigFieldInput({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string
  field: PluginConfigField
  value: unknown
  onChange: (value: unknown) => void
}): JSX.Element {
  switch (field.type) {
    case 'boolean':
      return (
        <div className="config-group">
          <label className="config-label config-toggle-row">
            <span>{field.label}</span>
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
          </label>
          {field.description && <span className="config-hint">{field.description}</span>}
        </div>
      )

    case 'number':
      return (
        <div className="config-group">
          <label className="config-label">
            {field.label}{field.min != null && field.max != null ? `: ${value ?? field.default ?? field.min}` : ''}
          </label>
          {field.min != null && field.max != null ? (
            <input
              className="config-slider"
              type="range"
              min={field.min}
              max={field.max}
              value={Number(value ?? field.default ?? field.min)}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          ) : (
            <input
              className="config-input"
              type="number"
              min={field.min}
              max={field.max}
              value={Number(value ?? field.default ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          )}
          {field.description && <span className="config-hint">{field.description}</span>}
        </div>
      )

    case 'select':
      return (
        <div className="config-group">
          <label className="config-label">{field.label}</label>
          <select
            className="config-input"
            value={String(value ?? field.default ?? '')}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          {field.description && <span className="config-hint">{field.description}</span>}
        </div>
      )

    case 'string':
    default:
      return (
        <div className="config-group">
          <label className="config-label">{field.label}</label>
          <input
            className="config-input"
            type="text"
            placeholder={field.default != null ? String(field.default) : ''}
            value={String(value ?? field.default ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description && <span className="config-hint">{field.description}</span>}
        </div>
      )
  }
}
