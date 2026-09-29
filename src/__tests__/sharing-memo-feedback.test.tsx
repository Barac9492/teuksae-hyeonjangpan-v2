import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { SharingPanel, type Story } from '../features/companion/sharing';
afterEach(cleanup);
function Harness() {
 const [stories,setStories]=useState<Story[]>([]);
 return <SharingPanel eventDay={null} stories={stories} onAddStory={(name,text)=>{setStories([{id:1,name,text,tilt:0}]);return null;}} onDeleteStory={id=>setStories(old=>old.filter(s=>s.id!==id))} onHideStory={()=>{}} onMoreStories={()=>{}} view="snacks" setView={()=>{}} venue="songrim" setVenue={()=>{}}/>;
}
it('replaces added feedback after deleting the memo',async()=>{
 const user=userEvent.setup();render(<Harness/>);
 await user.click(screen.getByRole('button',{name:/메모 작성하기/}));
 await user.type(screen.getByLabelText('메모'),'함께 나눈 아침');
 await user.click(screen.getByRole('button',{name:/나만 보는 메모에 추가/}));
 expect(screen.getByRole('status')).toHaveTextContent('추가했어요');
 await user.click(screen.getByRole('button',{name:'삭제'}));
 expect(screen.getByRole('status')).toHaveTextContent('메모를 삭제했어요');
 expect(screen.queryByText(/추가했어요/)).not.toBeInTheDocument();
 expect(screen.queryByText('함께 나눈 아침')).not.toBeInTheDocument();
 expect(screen.getByText('아직 남긴 메모가 없어요.')).toBeVisible();
});
