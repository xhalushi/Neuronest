import unittest
from simulation import Home

class SimulationTests(unittest.TestCase):
    def setUp(self):
        self.now=100
        self.h=Home(lambda:self.now)
        self.packet=dict(session='resident',screen=1,mode='manual',ready=True)
        self.h.session_update(self.packet)

    def command(self,action,confirmed=True):
        p=self.h.prepare({**self.packet,'action':action})
        return self.h.commit({**self.packet,'id':p['id'],'confirmed':confirmed})

    def test_idempotent_command(self):
        p=self.h.prepare({**self.packet,'action':dict(kind='set',target='bedroom.light',value=0)})
        first=self.h.commit({**self.packet,'id':p['id'],'confirmed':True})
        revision=self.h.revision
        self.assertEqual(first,self.h.commit({**self.packet,'id':p['id'],'confirmed':True}))
        self.assertEqual(self.h.revision,revision)

    def test_bed_confirmation_and_bounds(self):
        with self.assertRaises(ValueError):self.command(dict(kind='set',target='bed',value=5),False)
        with self.assertRaises(ValueError):self.command(dict(kind='set',target='bed',value=20))
        with self.assertRaises(ValueError):self.command(dict(kind='set',target='climate',value=100))

    def test_bed_completes_with_heartbeat(self):
        self.command(dict(kind='set',target='bed',value=5))
        for _ in range(5):
            self.now+=.5;self.h.session_update(self.packet);self.h.tick()
        self.assertEqual(self.h.devices['bed']['value'],5)
        self.assertFalse(self.h.devices['bed']['moving'])

    def test_bed_stops_when_input_lost_and_does_not_restart(self):
        self.command(dict(kind='set',target='bed',value=5));self.now+=1.6;self.h.tick()
        self.assertFalse(self.h.devices['bed']['moving'])
        self.h.session_update(self.packet);self.now+=10;self.h.tick()
        self.assertEqual(self.h.devices['bed']['value'],0)

    def test_wrong_screen_and_old_session_rejected(self):
        for replacement in [dict(screen=2),dict(session='other')]:
            with self.assertRaises(ValueError):self.h.prepare({**self.packet,**replacement,'action':dict(kind='set',target='bedroom.light',value=0)})

    def test_conditions_change_invalidates_pending(self):
        p=self.h.prepare({**self.packet,'action':dict(kind='help',category='Police')})
        self.h.scenario_action(dict(action='internet',value=False))
        with self.assertRaises(ValueError):self.h.commit({**self.packet,'id':p['id'],'confirmed':True})

    def test_expired_confirmation(self):
        p=self.h.prepare({**self.packet,'action':dict(kind='help',category='Medical')})
        self.now+=31;self.h.session_update(self.packet)
        with self.assertRaises(ValueError):self.h.commit({**self.packet,'id':p['id'],'confirmed':True})

    def test_outage_backup_and_partial_routine(self):
        self.h.scenario_action(dict(action='grid',value=False))
        self.command(dict(kind='set',target='bedroom.light',value=100))
        with self.assertRaises(ValueError):self.command(dict(kind='set',target='bed',value=5))
        result=self.command(dict(kind='routine',name='sleep'))
        self.assertIn('climate: unavailable',result['message'])

    def test_assistance_delivery_acknowledgment_and_cancel(self):
        self.command(dict(kind='help',category='Police'))
        r=self.h.requests[0]
        self.assertEqual(r['status'],'sending')
        with self.assertRaises(ValueError):self.h.request_action(dict(id=r['id'],action='acknowledge'))
        self.now+=1.1;self.h.tick();self.assertEqual(r['status'],'delivered')
        self.h.request_action(dict(id=r['id'],action='acknowledge'));self.assertEqual(r['status'],'acknowledged')
        self.h.request_action(dict(id=r['id'],action='cancel'));self.assertEqual(r['status'],'cancellation requested')

    def test_offline_request_fails_and_needs_retry(self):
        self.h.scenario_action(dict(action='internet',value=False))
        self.command(dict(kind='help',category='Evacuation'));r=self.h.requests[0]
        self.assertEqual(r['status'],'failed')
        self.h.scenario_action(dict(action='internet',value=True));self.h.tick()
        self.assertEqual(r['status'],'failed')
        self.h.request_action(dict(id=r['id'],action='retry'));self.assertEqual(r['status'],'sending')

    def test_duplicate_assistance_not_created(self):
        for _ in range(2):self.command(dict(kind='help',category='Caregiver'))
        self.assertEqual(len(self.h.requests),1)

    def test_stop_clears_pending_and_new_session_never_resumes(self):
        self.command(dict(kind='set',target='bed',value=5))
        self.h.session_update({**self.packet,'session':'new'})
        self.assertFalse(self.h.devices['bed']['moving'])

    def test_erp_confirmation_allows_a_fresh_round_but_still_expires(self):
        self.packet['mode']='erp'
        self.h.session_update(self.packet)
        p=self.h.prepare({**self.packet,'action':dict(kind='set',target='door',value=0)})
        self.assertEqual(p['expiresInSeconds'],90)
        self.assertEqual(self.h.devices['door']['value'],1)
        self.now+=40
        self.packet['screen']=2
        self.h.session_update(self.packet)
        self.h.commit({**self.packet,'id':p['id'],'confirmed':True})
        self.assertEqual(self.h.devices['door']['value'],0)
        p=self.h.prepare({**self.packet,'action':dict(kind='set',target='door',value=1)})
        self.now+=91;self.h.session_update(self.packet)
        with self.assertRaisesRegex(ValueError,'expired'):
            self.h.commit({**self.packet,'id':p['id'],'confirmed':True})

    def test_erp_pause_cancels_pending_confirmation(self):
        self.packet['mode']='erp';self.h.session_update(self.packet)
        p=self.h.prepare({**self.packet,'action':dict(kind='help',category='Caregiver')})
        self.h.session_update({**self.packet,'ready':False})
        self.h.session_update(self.packet)
        with self.assertRaisesRegex(ValueError,'expired'):
            self.h.commit({**self.packet,'id':p['id'],'confirmed':True})
        self.assertEqual(self.h.requests,[])

    def test_tv_requires_confirmation_and_supports_only_binary_values(self):
        self.assertEqual(self.h.devices['bedroom.tv']['value'],0)
        with self.assertRaises(ValueError):
            self.command(dict(kind='set',target='bedroom.tv',value=1),False)
        with self.assertRaises(ValueError):
            self.command(dict(kind='set',target='bedroom.tv',value=50))
        result=self.command(dict(kind='set',target='bedroom.tv',value=1))
        self.assertEqual(self.h.devices['bedroom.tv']['value'],1)
        self.assertEqual(result['receipt']['title'],'TV is on')
        self.assertFalse(self.h.devices['bedroom.tv']['moving'])
        self.command(dict(kind='routine',name='sleep'))
        self.assertEqual(self.h.devices['bedroom.tv']['value'],0)

    def test_blinds_receipt_reports_motion_and_reaches_target(self):
        result=self.command(dict(kind='set',target='bedroom.blind',value=0))
        self.assertEqual(result['receipt']['title'],'Blinds going down')
        self.assertTrue(self.h.devices['bedroom.blind']['moving'])
        self.now+=3.1;self.h.tick()
        self.assertEqual(self.h.devices['bedroom.blind']['value'],0)

    def test_unavailable_devices_and_offline_help_do_not_report_success(self):
        self.h.scenario_action(dict(action='grid',value=False))
        with self.assertRaises(ValueError):
            self.command(dict(kind='set',target='bedroom.tv',value=1))
        result=self.command(dict(kind='routine',name='sleep'))
        self.assertEqual(result['receipt']['tone'],'warning')
        self.h.scenario_action(dict(action='internet',value=False))
        result=self.command(dict(kind='help',category='Caregiver'))
        self.assertEqual(result['receipt']['tone'],'error')

if __name__=='__main__':unittest.main()
