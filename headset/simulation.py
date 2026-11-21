"""Authoritative, entirely local home and assistance simulation."""
import copy
import math
import time
import uuid

ROOMS = ('bedroom', 'living', 'kitchen', 'study')


class Home:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.reset()

    def reset(self):
        self.revision = 0
        self.devices = {}
        for room in ROOMS:
            self.devices[f'{room}.light'] = dict(kind='light', room=room, value=100, target=100, available=True, backup=True, moving=False)
            self.devices[f'{room}.blind'] = dict(kind='blind', room=room, value=70, target=70, available=True, backup=False, moving=False)
        self.devices['climate'] = dict(kind='climate', room='home', value=74, target=72, mode='cool', available=True, backup=False, moving=False)
        self.devices['bed'] = dict(kind='bed', room='bedroom', value=0, target=0, available=True, backup=False, moving=False)
        self.devices['door'] = dict(kind='lock', room='home', value=1, target=1, available=True, backup=True, moving=False)
        self.devices['bedroom.tv'] = dict(kind='appliance', room='bedroom', value=0, target=0, available=True, backup=False, moving=False)
        self.scenario = dict(internet=True, grid=True, hurricane=False)
        self.requests = []
        self.history = []
        self.pending = {}
        self.results = {}
        self.session = None
        self.last_tick = self.clock()
        self.event('Demo ready', 'system')

    def event(self, text, source='system'):
        self.revision += 1
        self.history.insert(0, dict(id=str(uuid.uuid4()), text=text, source=source, at=time.time()))
        self.history = self.history[:100]

    def online(self, device):
        return device['available'] and (self.scenario['grid'] or device['backup'])

    def snapshot(self):
        self.tick()
        return copy.deepcopy(dict(revision=self.revision, devices=self.devices, scenario=self.scenario,
                                  requests=self.requests, history=self.history))

    def stop(self, target, reason='Stopped'):
        if target in self.devices:
            device = self.devices[target]
            if device['moving']:
                device.update(moving=False, target=device['value'])
                self.event(f'{target}: {reason}')

    def session_update(self, packet):
        mode = packet.get('mode')
        if mode not in ('manual', 'alpha', 'ssvep', 'erp'):
            raise ValueError('Unknown input mode')
        identifier = str(packet.get('session', ''))
        if not identifier or len(identifier) > 100:
            raise ValueError('Missing session')
        changed = not self.session or self.session['id'] != identifier or self.session['mode'] != mode
        if changed:
            self.stop('bed', 'Input session changed')
            self.pending.clear()
        self.session = dict(id=identifier, mode=mode, screen=packet.get('screen'), at=self.clock(), ready=packet.get('ready') is True)
        if not self.session['ready']:
            self.stop('bed', 'Input paused')
            self.pending.clear()

    def valid_session(self, packet):
        s = self.session
        if not s or packet.get('session') != s['id'] or packet.get('screen') != s['screen'] or not s['ready'] or self.clock()-s['at'] > 1.5:
            raise ValueError('Input paused or screen changed. Please select again.')
        return s['mode']

    def validate(self, action):
        if not isinstance(action, dict):
            raise ValueError('Expected an action object')
        kind = action.get('kind')
        if kind == 'help':
            if action.get('category') not in ('Caregiver', 'Emergency', 'Medical', 'Police', 'Fire', 'Evacuation'):
                raise ValueError('Unknown assistance category')
            return True
        if kind == 'routine':
            if action.get('name') not in ('sleep', 'morning'):
                raise ValueError('Unknown routine')
            return True
        target = action.get('target')
        if target not in self.devices:
            raise ValueError('Unknown device')
        device = self.devices[target]
        if kind == 'stop' and device['kind'] in ('bed', 'blind'):
            return False
        if kind != 'set' or not self.online(device):
            raise ValueError('Device unavailable')
        value = action.get('value')
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
            raise ValueError('Invalid device value')
        low, high = (60, 85) if target == 'climate' else (0, 45) if target == 'bed' else (0, 1) if target == 'door' else (0, 100)
        if not low <= value <= high:
            raise ValueError('Value outside demo limits')
        if device['kind']=='light' and value not in (0,100):
            raise ValueError('Lights support only on or off')
        if device['kind']=='lock' and value not in (0,1):
            raise ValueError('Door supports only locked or unlocked')
        if device['kind']=='appliance' and value not in (0,1):
            raise ValueError('Appliances support only on or off')
        if target == 'bed' and (device['moving'] or abs(value-device['value']) > 5.01):
            raise ValueError('Bed requires a stationary start and a maximum five-degree step')
        if target == 'climate' and action.get('mode', device['mode']) not in ('heat', 'cool', 'off'):
            raise ValueError('Invalid climate mode')
        return True

    def prepare(self, packet):
        mode = self.valid_session(packet)
        self.pending = {key: value for key, value in self.pending.items() if value['expires'] > self.clock()}
        action = packet.get('action', {})
        requires = self.validate(action)
        identifier = str(uuid.uuid4())
        duration = 90 if mode == 'erp' else 30
        pending = dict(id=identifier, action=copy.deepcopy(action), revision=self.revision,
                       session=self.session['id'], expires=self.clock()+duration, source=mode, requires=requires)
        self.pending[identifier] = pending
        return dict(id=identifier, requiresConfirmation=requires, expiresInSeconds=duration)

    def commit(self, packet):
        identifier = packet.get('id')
        if identifier in self.results:
            return self.results[identifier]
        mode = self.valid_session(packet)
        pending = self.pending.pop(identifier, None)
        if not pending or pending['session'] != self.session['id'] or self.clock() > pending['expires']:
            raise ValueError('Command expired. Please select again.')
        if pending['revision'] != self.revision:
            raise ValueError('Home conditions changed. Review the action again.')
        if pending['requires'] and packet.get('confirmed') is not True:
            raise ValueError('Confirmation required')
        action = pending['action']
        self.validate(action)
        result = self.execute(action, mode)
        self.results[identifier] = result
        if len(self.results) > 500:
            self.results.pop(next(iter(self.results)))
        return result

    def execute(self, action, source):
        kind = action['kind']
        if kind == 'help':
            active = next((r for r in self.requests if r['category'] == action['category'] and r['status'] not in ('resolved', 'canceled')), None)
            if active:
                return dict(message='An active request already exists', request=active, receipt=dict(tone='warning', title='Request already exists', detail='Your existing simulated request is still active.'))
            request = dict(id=str(uuid.uuid4()), category=action['category'], status='sending' if self.scenario['internet'] else 'failed',
                           created=time.time(), deadline=self.clock()+1, resident='Alex Morgan', address='100 Demo Lane, Tampa (fictional)',
                           needs='Wheelchair access; assistance with transfer; nonverbal communication', source=source)
            self.requests.insert(0, request)
            self.event(f"Simulated {request['category']} request: {request['status']}", source)
            failed=request['status']=='failed'
            return dict(message='Simulated assistance request created', receipt=dict(tone='error' if failed else 'success', title='Request could not be sent' if failed else 'Assistance requested', detail='The simulated connection is offline. Retry from Presenter tools.' if failed else f"Your simulated {request['category'].lower()} request is sending. No real call was made."))
        if kind == 'routine':
            morning = action['name'] == 'morning'
            outcomes = []
            changes=[('bedroom.light', 100 if morning else 0), ('bedroom.blind', 100 if morning else 0), ('climate', 74 if morning else 72)]
            if not morning:
                changes.append(('bedroom.tv', 0))
            for target, value in changes:
                if not self.online(self.devices[target]):
                    outcomes.append(f'{target}: unavailable')
                else:
                    self.execute(dict(kind='set', target=target, value=value), source)
                    outcomes.append(f'{target}: accepted')
            message = '; '.join(outcomes)
            self.event('Routine: '+message, source)
            partial=any('unavailable' in outcome for outcome in outcomes)
            return dict(message=message, receipt=dict(tone='warning' if partial else 'success', title='Preset partly applied' if partial else ('Good morning' if morning else 'Ready for a restful night'), detail='Some devices have no power or are unavailable.' if partial else ('Lights on, blinds rising, AC set to 74°F.' if morning else 'Lights and TV off, blinds lowering, AC set to 72°F.')))
        target = action['target']
        if kind == 'stop':
            self.stop(target, 'Stopped by resident')
            return dict(message='Movement stopped')
        d = self.devices[target]
        d['target'] = action['value']
        if d['kind'] in ('light','lock','appliance'):
            d['value'] = d['target']
        elif d['kind'] == 'climate':
            d['mode'] = action.get('mode', d['mode'])
        else:
            d.update(moving=d['value'] != d['target'], deadline=self.clock()+(2 if target == 'bed' else 3), start=d['value'], started=self.clock())
        self.event(f"{target}: set to {d['target']}"+(f" °F · {d['mode']}" if target == 'climate' else ''), source)
        titles={'bedroom.light': 'Lights on' if d['target'] else 'Lights off',
                'bedroom.tv': 'TV is on' if d['target'] else 'TV is off',
                'bedroom.blind': 'Blinds going up' if d['target'] else 'Blinds going down',
                'climate': f"AC set to {d['target']:g}°F"}
        title=titles.get(target,'Command accepted')
        return dict(message='Command accepted', receipt=dict(tone='success',title=title,detail='Your bedroom is updating in the live preview.' if d['moving'] else 'Your change is now reflected in the room.'))

    def tick(self):
        now = self.clock()
        dt = min(1, max(0, now-self.last_tick))
        self.last_tick = now
        for target, d in self.devices.items():
            if d['moving']:
                if not self.online(d) or (target == 'bed' and (not self.session or not self.session['ready'] or now-self.session['at'] > 1.5)):
                    self.stop(target, 'Connection or power unavailable')
                    continue
                fraction = min(1, (now-d['started'])/(d['deadline']-d['started']))
                d['value'] = d['start']+(d['target']-d['start'])*fraction
                if fraction >= 1:
                    d['moving'] = False
                    self.event(f'{target}: movement complete')
        climate = self.devices['climate']
        if self.online(climate) and climate['mode'] != 'off':
            difference = climate['target']-climate['value']
            if (difference > 0 and climate['mode']=='heat') or (difference < 0 and climate['mode']=='cool'):
                climate['value'] += math.copysign(min(abs(difference), dt*.04), difference)
        for r in self.requests:
            if r['status'] == 'sending' and now >= r['deadline']:
                r['status'] = 'delivered' if self.scenario['internet'] else 'failed'
                self.event(f"Simulated {r['category']} request: {r['status']}")

    def scenario_action(self, packet):
        action = packet.get('action')
        if action == 'reset':
            self.reset()
        elif action in ('internet', 'grid', 'hurricane'):
            self.scenario[action] = packet.get('value') is True
            self.pending.clear()
            if action == 'hurricane':
                self.stop('bed', 'Scenario changed')
            self.event(f"Scenario {action}: {self.scenario[action]}", 'presenter')
        elif action == 'fault':
            if packet.get('target') not in self.devices:
                raise ValueError('Unknown device')
            self.devices[packet['target']]['available'] = packet.get('value') is True
            self.pending.clear()
            self.event(f"Device availability changed: {packet['target']}", 'presenter')
        else:
            raise ValueError('Unknown scenario')
        self.tick()

    def request_action(self, packet):
        request = next((r for r in self.requests if r['id'] == packet.get('id')), None)
        if not request:
            raise ValueError('Request not found')
        action = packet.get('action')
        status = request['status']
        if action == 'acknowledge' and status == 'delivered':
            request['status'] = 'acknowledged'
        elif action == 'resolve' and status in ('acknowledged', 'cancellation requested'):
            request['status'] = 'resolved'
        elif action == 'cancel' and status not in ('resolved', 'canceled'):
            request['status'] = 'cancellation requested' if status in ('delivered', 'acknowledged') else 'canceled'
        elif action == 'retry' and status == 'failed' and self.scenario['internet']:
            request.update(status='sending', deadline=self.clock()+1)
        else:
            raise ValueError('Request cannot make that transition')
        self.event(f"Simulated {request['category']} request: {request['status']}", 'presenter' if action in ('acknowledge', 'resolve') else 'resident')
