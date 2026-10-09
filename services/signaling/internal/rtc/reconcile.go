package rtc

import (
	"context"
	"errors"
)

type reconciliationStore interface {
	ReconciliationRooms(context.Context, string) ([]string, error)
}

type roomLifecycle interface {
	Ended(context.Context) (bool, error)
}

func (adapter *Adapter) Reconcile(ctx context.Context) error {
	store, ok := adapter.store.(reconciliationStore)
	if !ok {
		return nil
	}
	roomIDs, err := store.ReconciliationRooms(ctx, adapter.nodeID)
	if err != nil {
		return err
	}
	var failures []error
	for _, roomID := range roomIDs {
		err := adapter.store.WithRoom(ctx, roomID, func(room LockedRoom) error {
			scope, state, err := room.Load(ctx)
			if err != nil {
				return err
			}
			if state.MediaNodeID != adapter.nodeID {
				return ErrUnavailable
			}
			scope.MediaNodeID, scope.Generation = state.MediaNodeID, state.Generation
			if lifecycle, ok := room.(roomLifecycle); ok {
				ended, err := lifecycle.Ended(ctx)
				if err != nil {
					return err
				}
				if ended {
					state.Closing = true
				}
			}
			if state.Closing {
				if err := room.Save(ctx, state); err != nil {
					return err
				}
				if err := adapter.checkCleanupNode(ctx, scope); err != nil {
					return err
				}
				command, err := LifecycleCommand("room.close", scope, "reconcile_"+newID())
				if err != nil {
					return err
				}
				if _, err := adapter.media.Execute(ctx, command); err != nil && !missing(err) {
					return err
				}
				state.Ready, state.Allocating, state.Generation, state.Sessions = false, false, "", map[string]*SessionState{}
				return room.Save(ctx, state)
			}
			if state.Allocating {
				return adapter.releaseAllocation(ctx, room, scope, state)
			}
			for sessionID, session := range state.Sessions {
				if !session.Pending {
					continue
				}
				scope.SessionID, scope.MediaParticipantID, scope.ParticipantID = sessionID, sessionID, session.ParticipantID
				if err := adapter.cleanup(ctx, room, scope, state); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}
