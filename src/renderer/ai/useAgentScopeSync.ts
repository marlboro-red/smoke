/**
 * Watches group membership changes in groupStore and syncs the scope
 * (set of allowed session IDs) to the main process for each agent
 * that is assigned to a group.
 */

import { useEffect } from 'react'
import { groupStore } from '../stores/groupStore'
import { agentStore } from '../stores/agentStore'

export function useAgentScopeSync(): void {
  useEffect(() => {
    const unsubscribe = groupStore.subscribe((state, prevState) => {
      if (state.groups === prevState.groups) return

      // For each agent with an assigned group, check if that group's membership changed
      const agents = agentStore.getState().agents
      for (const agent of agents.values()) {
        if (!agent.assignedGroupId) continue

        const group = state.groups.get(agent.assignedGroupId)
        const prevGroup = prevState.groups.get(agent.assignedGroupId)

        if (!group) continue
        if (group.memberIds === prevGroup?.memberIds) continue

        // Push updated scope to main process
        window.smokeAPI?.agent.updateScope(agent.id, group.memberIds)
      }
    })

    return () => unsubscribe()
  }, [])
}
